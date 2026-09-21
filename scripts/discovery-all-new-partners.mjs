#!/usr/bin/env node
/**
 * Run partner-scoped discovery over every partner that has NO events yet
 * (auto-targets the newly-inserted 95). Sequential; new events -> Inbox.
 *   node scripts/discovery-all-new-partners.mjs
 *   DRY_RUN=1 node scripts/discovery-all-new-partners.mjs   # list targets, no calls
 *   LIMIT=10 node scripts/discovery-all-new-partners.mjs     # cap for a test
 * Env: BASE_URL(def http://localhost:3000) ADMIN_EMAIL(def irmak@coder.com)
 *      ADMIN_PASSWORD(def change-me-now) DELAY_MS(def 3000) PER_CALL_TIMEOUT_MS(def 330000)
 */
const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "irmak@coder.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me-now";
const DELAY_MS = Number(process.env.DELAY_MS || 3000);
const PER_CALL_TIMEOUT_MS = Number(process.env.PER_CALL_TIMEOUT_MS || 330000);
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
const DRY_RUN = process.env.DRY_RUN === "1";

const PRIORITY = ["Momentumai","CloudSecure","GlobalLogic","Trace3","CDW","SHI","Liquid PC","Next Orbit","Masterpoint",
  "Cloudreach","Contino","Eficode","Kreuzwerker","Lemongrass","Reply","Data Reply","Storm Reply","Zühlke","Version 1",
  "Endava","Var Group","Caylent","Avahi","Artefact","B.Telligent","Celebal Technologies","Infomotion","Lovelytics",
  "Tasq.ai","Smartis","Zeb","Fellowmind","Swisscom","Adaptavist","codecentric","AND Digital","DEPT","Kin+Carta","Ahead",
  "Presidio","EVOTEK","Technologent","Megazone"];
const rank = (n) => { const i = PRIORITY.indexOf(n); return i === -1 ? PRIORITY.length + 1 : i; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }) });
  if (!res.ok) throw new Error(`Login failed (${res.status}).`);
  const m = (res.headers.get("set-cookie") || "").match(/session=([^;]+)/);
  if (!m) throw new Error("Login ok but no session cookie.");
  return `session=${m[1]}`;
}
async function eventless(cookie) {
  const res = await fetch(`${BASE_URL}/api/partners`, { headers: { Cookie: cookie } });
  if (!res.ok) throw new Error(`List partners failed (${res.status}).`);
  return (await res.json()).filter((p) => (p._count?.events ?? 0) === 0)
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}
async function discover(cookie, partnerId) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PER_CALL_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/api/discovery`, { method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ partnerId }), signal: ctrl.signal });
    return { status: res.status, ...(await res.json().catch(() => ({}))) };
  } finally { clearTimeout(t); }
}
async function main() {
  const cookie = await login();
  let targets = await eventless(cookie);
  if (Number.isFinite(LIMIT)) targets = targets.slice(0, LIMIT);
  console.log(`${targets.length} eventless partner(s):`);
  targets.forEach((p, i) => console.log(`  ${String(i + 1).padStart(2)}. ${p.name}`));
  if (DRY_RUN) { console.log("\nDRY_RUN — no calls made."); return; }
  let found = 0, ran = 0, err = [];
  for (const p of targets) {
    process.stdout.write(`\n[${ran + 1}/${targets.length}] ${p.name} … `);
    try {
      const r = await discover(cookie, p.id);
      if (r.status === 200 && r.ok) { console.log(`+${r.found ?? 0} new (of ${r.total ?? "?"})`); found += r.found ?? 0; }
      else { console.log(`error ${r.status}: ${r.error ?? "unknown"}`); err.push(p.name); }
    } catch (e) { console.log(`failed: ${e.name === "AbortError" ? "timeout" : e.message}`); err.push(p.name); }
    ran++; await sleep(DELAY_MS);
  }
  console.log(`\n\n===== Done: ${ran} run, ${found} new events =====`);
  if (err.length) console.log(`Errored (${err.length}): ${err.join(", ")}`);
}
main().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
