#!/usr/bin/env node
/**
 * Cleanup discovery pass: retries only partners that still have NO events
 * AND were never successfully attempted — i.e. those that errored in pass 1
 * (fetch failed / 502) plus any partner added after pass 1 started (the 5 LATAM).
 * It intentionally SKIPS partners that already got a completed run with 0 finds,
 * so it stays short. Sequential; new events -> Inbox.
 */
const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "irmak@coder.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me-now";
const DELAY_MS = Number(process.env.DELAY_MS || 4000);
const PER_CALL_TIMEOUT_MS = Number(process.env.PER_CALL_TIMEOUT_MS || 330000);
import { readFileSync } from "node:fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Names that errored in pass 1 (parsed from the log) + the 5 new LATAM partners.
function erroredFromLog() {
  try {
    const log = readFileSync("/tmp/partner-discovery.log", "utf8");
    const names = new Set();
    for (const line of log.split("\n")) {
      const m = line.match(/\]\s+(.+?)\s+…\s+(error \d|failed:)/);
      if (m) names.add(m[1].trim());
    }
    return names;
  } catch { return new Set(); }
}
const LATAM_NEW = ["SONDA", "TIVIT", "Softtek", "Globant", "CI&T", "Stefanini"];

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

async function main() {
  const cookie = await login();
  const all = await partners(cookie);
  const wanted = new Set([...erroredFromLog(), ...LATAM_NEW]);
  // Only retry ones that are still eventless.
  const targets = all.filter((p) => (p._count?.events ?? 0) === 0 && wanted.has(p.name));
  console.log(`Retry targets (errored + new LATAM, still eventless): ${targets.length}`);
  targets.forEach((p, i) => console.log(`  ${i + 1}. ${p.name}`));
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
  console.log(`\n\n===== Cleanup done: ${ran} run, ${found} new events =====`);
  if (err.length) console.log(`Still errored (${err.length}): ${err.join(", ")}`);
}
main().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
