#!/usr/bin/env node
/**
 * Re-run partner discovery for eventless partners in the given REGIONS
 * (default "NAMER,LATAM"). Uses the (now 2026-2027) partner prompt.
 *   REGIONS=NAMER,LATAM node scripts/discovery-region.mjs
 */
const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "irmak@coder.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me-now";
const DELAY_MS = Number(process.env.DELAY_MS || 4000);
const PER_CALL_TIMEOUT_MS = Number(process.env.PER_CALL_TIMEOUT_MS || 330000);
const REGIONS = (process.env.REGIONS || "NAMER,LATAM").split(",").map((r) => r.trim());
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
async function partners(cookie) {
  const res = await fetch(`${BASE_URL}/api/partners`, { headers: { Cookie: cookie } });
  if (!res.ok) throw new Error(`List partners failed (${res.status}).`);
  return res.json();
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
const inRegions = (p) => (p.region || "").split(",").map((x) => x.trim()).some((r) => REGIONS.includes(r));

async function main() {
  const cookie = await login();
  const all = await partners(cookie);
  const targets = all.filter((p) => (p._count?.events ?? 0) === 0 && inRegions(p));
  console.log(`Re-discovery targets (eventless in ${REGIONS.join("/")}): ${targets.length}`);
  targets.forEach((p, i) => console.log(`  ${i + 1}. ${p.name} [${p.region}]`));
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
  console.log(`\n\n===== Region re-discovery done: ${ran} run, ${found} new events =====`);
  if (err.length) console.log(`Errored (${err.length}): ${err.join(", ")}`);
}
main().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
