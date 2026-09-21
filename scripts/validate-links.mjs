import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === "1";
const LINK_FIELDS = ["url", "applyUrl", "attendUrl", "howToApply"];
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function isHttpUrl(v) {
  if (!v || typeof v !== "string") return false;
  return /^https?:\/\/\S+$/i.test(v.trim());
}

// Returns { dead: boolean, reason: string }
async function checkUrl(url) {
  const attempt = async (method) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(url, {
        method,
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "User-Agent": UA, Accept: "*/*" },
      });
      return { status: res.status };
    } finally {
      clearTimeout(t);
    }
  };

  try {
    // Try GET (HEAD is often blocked / misreported).
    let r;
    try {
      r = await attempt("GET");
    } catch (e) {
      // one retry for transient network blips
      await new Promise((res) => setTimeout(res, 1500));
      r = await attempt("GET");
    }
    // Definitively dead only on 404 / 410.
    if (r.status === 404 || r.status === 410)
      return { dead: true, reason: `HTTP ${r.status}` };
    return { dead: false, reason: `HTTP ${r.status}` };
  } catch (e) {
    const code = e?.cause?.code || e?.code || "";
    const msg = String(e?.cause?.message || e?.message || e);
    // Definitively dead: domain does not resolve / connection refused.
    if (code === "ENOTFOUND" || /ENOTFOUND|getaddrinfo/i.test(msg))
      return { dead: true, reason: "DNS no-resolve (ENOTFOUND)" };
    if (code === "ECONNREFUSED" || /ECONNREFUSED/i.test(msg))
      return { dead: true, reason: "connection refused" };
    // Everything else (timeout, TLS, reset, 5xx-ish) => keep (may be transient/bot-block).
    return { dead: false, reason: `keep (${code || msg.slice(0, 40)})` };
  }
}

async function main() {
  const events = await db.event.findMany({
    select: { id: true, title: true, url: true, applyUrl: true, attendUrl: true, howToApply: true },
  });

  // Collect distinct URLs across all link fields.
  const urlSet = new Set();
  for (const e of events)
    for (const f of LINK_FIELDS) if (isHttpUrl(e[f])) urlSet.add(e[f].trim());
  const urls = [...urlSet];
  console.log(`Events: ${events.length}. Distinct HTTP links to check: ${urls.length}. DRY_RUN=${DRY_RUN ? "yes" : "no"}`);

  // Check with limited concurrency.
  const result = new Map();
  const CONC = 12;
  let idx = 0, done = 0;
  async function worker() {
    while (idx < urls.length) {
      const u = urls[idx++];
      const r = await checkUrl(u);
      result.set(u, r);
      done++;
      if (done % 25 === 0) console.log(`  checked ${done}/${urls.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));

  const deadUrls = [...result.entries()].filter(([, r]) => r.dead);
  console.log(`\nDead links: ${deadUrls.length} of ${urls.length}`);
  for (const [u, r] of deadUrls) console.log(`  DEAD [${r.reason}] ${u.slice(0, 90)}`);

  // Apply: null out dead links per event/field.
  let cleared = 0, eventsTouched = 0;
  for (const e of events) {
    const patch = {};
    for (const f of LINK_FIELDS) {
      const v = e[f];
      if (isHttpUrl(v) && result.get(v.trim())?.dead) {
        patch[f] = null;
        cleared++;
      }
    }
    if (Object.keys(patch).length) {
      eventsTouched++;
      if (!DRY_RUN) await db.event.update({ where: { id: e.id }, data: patch });
    }
  }
  console.log(`\n${DRY_RUN ? "[dry-run] WOULD clear" : "Cleared"} ${cleared} dead link field(s) across ${eventsTouched} event(s).`);
  await db.$disconnect();
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
