/**
 * Prototype: authenticate an MCP server to Event Radar as a real user.
 *
 * The alternative considered was a static MCP_TOKEN checked in the MCP route.
 * A service account wins on three counts: it needs NO server-side change (the
 * app already has email+password), it inherits the ADMIN/MEMBER split as real
 * authorization rather than tool-level etiquette, and it is the only shape that
 * fits a codebase where every read and write is scoped to the caller's own
 * EventOpportunity rows.
 *
 * Better Auth 1.7.5 is configured here with NO plugins (see src/lib/auth.ts),
 * so this is cookie sessions only — hence the cookie jar in mcp/client.mjs,
 * which this shares with the MCP server so the two cannot drift. Adding
 * better-auth/plugins/bearer (which IS shipped in 1.7.5) would replace all of
 * it with an Authorization header; that is a config change, deliberately not
 * made here so the prototype proves the app works UNMODIFIED.
 *
 *   node scripts/mcp-auth-prototype.mjs [baseUrl]
 */
import { EventRadarClient } from "../mcp/client.mjs";

const BASE = process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.MCP_SERVICE_EMAIL;
const PASSWORD = process.env.MCP_SERVICE_PASSWORD;

const ok = (b) => (b ? "PASS" : "FAIL");
const results = [];
const check = (name, pass, detail = "") => { results.push(pass); console.log(`  [${ok(pass)}] ${name}${detail ? " — " + detail : ""}`); };

const c = new EventRadarClient({ baseUrl: BASE, email: EMAIL, password: PASSWORD });

console.log(`\nEvent Radar MCP auth prototype → ${BASE}\n`);

console.log("1. Headless sign-in (asserting Origin)");
const { names, body } = await c.signIn();
check("session cookie issued", names.length > 0, names.join(", "));
check("user identified", !!body?.user?.email, body?.user?.email);
check("role is MEMBER (least privilege)", body?.user?.role === "MEMBER", String(body?.user?.role));

console.log("\n2. Authenticated reads");
const counts = await c.api("/api/events/counts");
check("GET /api/events/counts → 200", counts.status === 200, JSON.stringify(await counts.clone().json()));
const inbox = await c.api("/api/events?view=inbox&status=DISCOVERED");
const rows = inbox.ok ? await inbox.json() : [];
check("GET /api/events (inbox view) → 200", inbox.status === 200, `${rows.length} rows`);

console.log("\n3. Per-speaker scoping (PR #17/#19)");
const scoped = rows.length === 0 || rows.every((r) => r.relevancyScore === null || r.relevancyScore === undefined);
check("fresh account sees its OWN unscored rows", scoped,
  rows.length ? `first score = ${JSON.stringify(rows[0]?.relevancyScore)}` : "no rows");

console.log("\n4. Authorization boundary (MEMBER must not be ADMIN)");
const users = await c.api("/api/users");
check("GET /api/users → 403 (admin-only)", users.status === 403, `got ${users.status}`);
const disco = await c.api("/api/discovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
check("POST /api/discovery → 403 (admin-only)", disco.status === 403, `got ${disco.status}`);

console.log("\n5. Expired-session recovery");
c.expireCookie();
const recovered = await c.api("/api/events/counts");
check("stale cookie → auto re-signin → 200", recovered.status === 200, `got ${recovered.status}`);

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed${failed ? ` — ${failed} FAILED` : ""}\n`);
process.exit(failed ? 1 : 0);
