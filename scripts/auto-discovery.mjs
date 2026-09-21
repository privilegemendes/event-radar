/**
 * Workspace-side auto-discovery loop.
 *
 * Calls the app's cron discovery endpoint on an interval so Event Radar keeps
 * finding new events while this workspace is running. In production, prefer the
 * Vercel Cron job defined in vercel.json instead of this script.
 *
 * Usage:
 *   node scripts/auto-discovery.mjs                 # every 7d, hits localhost:3000
 *   INTERVAL_HOURS=3 BASE_URL=http://localhost:3000 node scripts/auto-discovery.mjs
 *   CRON_SECRET=xyz node scripts/auto-discovery.mjs # if the endpoint is locked down
 */
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const INTERVAL_MS = Number(process.env.INTERVAL_HOURS || 168) * 60 * 60 * 1000;
const SECRET = process.env.CRON_SECRET || "";

async function runOnce() {
  const url = `${BASE_URL}/api/cron/discovery${SECRET ? `?key=${encodeURIComponent(SECRET)}` : ""}`;
  const started = new Date().toISOString();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: SECRET ? { Authorization: `Bearer ${SECRET}` } : {},
    });
    const body = await res.json().catch(() => ({}));
    console.log(`[auto-discovery] ${started} -> ${res.status}`, JSON.stringify(body));
  } catch (err) {
    console.error(`[auto-discovery] ${started} -> error`, err?.message || err);
  }
}

console.log(`[auto-discovery] starting; every ${INTERVAL_MS / 3600000}h against ${BASE_URL}`);
await runOnce();
setInterval(runOnce, INTERVAL_MS);
