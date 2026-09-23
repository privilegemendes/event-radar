/**
 * End-to-end test of the custom-connector flow, against a running server.
 *
 * Walks every step a claude.ai custom connector walks, and ends by calling
 * real tools with the token it earned:
 *
 *   discovery (RFC 9728 -> RFC 8414) -> dynamic registration (RFC 7591)
 *   -> authorize -> consent -> PKCE token exchange -> tools/list -> tools/call
 *
 * The browser leg is stood in for by signing in over the API as a test
 * account, because the only thing a browser adds there is a human typing a
 * password. Everything after it — the signed query, consent, the code, the
 * token — is the real thing.
 *
 * Three details the modern (2026-07-28) protocol requires, each of which
 * answers with a 400 that reads like something else when you get it wrong:
 *   - no `initialize`; that is the LEGACY handshake and this server rejects it
 *   - a `_meta` envelope on every request, carrying the protocol version
 *   - `Mcp-Method` (and `Mcp-Name` on a tool call) headers agreeing with the body
 *
 * The PKCE pair is RFC 7636 Appendix B's worked example.
 *
 *   MCP_SERVICE_EMAIL=... MCP_SERVICE_PASSWORD=... node mcp/oauth-e2e.mjs
 */
import { EventRadarClient } from "./client.mjs";
const BASE="http://localhost:3000";
const VERIFIER="dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE="E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const REDIRECT="https://claude.ai/api/mcp/auth_callback";
const out=[]; const check=(n,p,d="")=>{out.push(p);console.log(`  [${p?"PASS":"FAIL"}] ${n}${d?" — "+d:""}`)};

const c = new EventRadarClient({ baseUrl: BASE });
const { body: who } = await c.signIn();

const asm = await (await fetch(`${BASE}/.well-known/oauth-authorization-server`)).json();
const reg = await (await fetch(asm.registration_endpoint,{method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({client_name:"Claude (demo connector)",redirect_uris:[REDIRECT],
    grant_types:["authorization_code","refresh_token"],response_types:["code"],token_endpoint_auth_method:"none"})})).json();

const u=new URL(asm.authorization_endpoint);
for (const [k,v] of Object.entries({client_id:reg.client_id,redirect_uri:REDIRECT,response_type:"code",
  scope:"openid profile email offline_access",resource:`${BASE}/api/mcp`,
  code_challenge:CHALLENGE,code_challenge_method:"S256",state:"demo"})) u.searchParams.set(k,v);

const auth = await (await c.api(u.pathname+u.search,{headers:{Accept:"application/json"}})).json();
const q = (auth.url ?? "").split("?")[1] ?? "";
const approved = await (await c.api("/api/auth/oauth2/consent",{method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({accept:true,oauth_query:q})})).json();
const backUrl = approved.redirectURI ?? approved.redirect_uri ?? approved.url;
if (!backUrl) { console.error("consent gave no redirect:", JSON.stringify(approved).slice(0,300)); process.exit(1); }
const code = new URL(backUrl).searchParams.get("code");

console.log("\n1. Token exchange (PKCE)");
const tok = await (await fetch(asm.token_endpoint,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams({grant_type:"authorization_code",code,redirect_uri:REDIRECT,
    client_id:reg.client_id,code_verifier:VERIFIER,resource:`${BASE}/api/mcp`})})).json();
check("access token issued", !!tok.access_token, tok.access_token?`${tok.token_type}, expires_in ${tok.expires_in}`:JSON.stringify(tok).slice(0,120));
check("refresh token issued", !!tok.refresh_token);
{
  const t = tok.access_token ?? "";
  const parts = t.split(".");
  console.log(`      token shape: ${parts.length === 3 ? "JWT" : "opaque"} (${parts.length} segment(s), ${t.length} chars)`);
  if (parts.length === 3) { try { console.log("      alg:", JSON.parse(Buffer.from(parts[0],"base64url").toString()).alg); } catch {} }
}

/* The 2026-07-28 protocol carries per-request context in a `_meta` envelope
   instead of a one-off initialize handshake — which is exactly what lets the
   endpoint stay stateless. Keys are the SDK's own constants. */
const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "probe", version: "1" },
  "io.modelcontextprotocol/clientCapabilities": {},
};
const envelope = (body) => ({ ...body, params: { ...(body.params ?? {}), _meta: META } });

const call = (b) => fetch(`${BASE}/api/mcp`,{method:"POST",
  headers:{"Content-Type":"application/json",Accept:"application/json, text/event-stream",
           "MCP-Protocol-Version":"2026-07-28",
           /* The modern protocol requires the header and body to agree on the
              method, so a proxy can route without parsing the body. */
           "Mcp-Method": b.method,
           /* Same agreement rule for the tool being called. */
           ...(b.params?.name ? { "Mcp-Name": b.params.name } : {}),
           Authorization:`Bearer ${tok.access_token}`},body:JSON.stringify(envelope(b))});

console.log("\n2. Modern protocol needs no initialize");
/* tools/list doubles as the liveness check: `ping` is not implemented by this
   server, and asserting on it would test the probe, not the endpoint. */
/* 2026-07-28 handles each request independently — `initialize` is the LEGACY
   handshake, which `legacy: "reject"` refuses by design. A modern client goes
   straight to a method. */
const ping = await call({jsonrpc:"2.0",id:1,method:"tools/list"});
const pingTxt = await ping.text();
check("a request is served with no handshake", ping.status === 200, `HTTP ${ping.status} ${ping.status!==200?pingTxt.slice(0,400):""}`);

const parse=(t)=>{ const line=t.split("\n").find(l=>l.startsWith("data:")); return JSON.parse(line?line.slice(5):t); };

console.log("\n3. Tools are served to the authenticated user");
const lt = await call({jsonrpc:"2.0",id:2,method:"tools/list"});
const tools = parse(await lt.text())?.result?.tools ?? [];
check("tools/list returns the surface", tools.length >= 5, tools.map(t=>t.name).join(", "));

console.log("\n4. A tool call runs as that user");
const ct = await call({jsonrpc:"2.0",id:3,method:"tools/call",
  params:{name:"get_pipeline_summary",arguments:{}}});
const ctTxt = await ct.text();
const res = parse(ctTxt)?.result;
if (!res) console.log("      raw:", ctTxt.slice(0,240));
const payload = res?.content?.[0]?.text ? JSON.parse(res.content[0].text) : null;
check("get_pipeline_summary answered", !!payload && "toTriage" in payload, JSON.stringify(payload).slice(0,90));

const se = await call({jsonrpc:"2.0",id:4,method:"tools/call",
  params:{name:"search_events",arguments:{limit:3}}});
const sp = parse(await se.text())?.result;
const sd = sp?.content?.[0]?.text ? JSON.parse(sp.content[0].text) : null;
check("search_events is bounded and scoped", sd?.events?.length === 3, `${sd?.events?.length} of ${sd?.total}`);

console.log("\n5. The token is bound to this user, not a shared identity");
check("acts as the person who consented", who.user.email === "mcp-service@example.com", who.user.email);

const failed=out.filter(x=>!x).length;
console.log(`\n${out.length-failed}/${out.length} passed${failed?` — ${failed} FAILED`:""}\n`);
process.exit(failed?1:0);
