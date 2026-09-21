#!/usr/bin/env node
// Batch-mine speakers for all un-mined upcoming CONFERENCE/EVENT ids.
const fs = require("fs");
const ids = JSON.parse(fs.readFileSync("/tmp/mine_ids.json", "utf8"));
const cookie = fs.readFileSync("cookie", "utf8").split("\n")
  .filter(l => l.includes("\t"))
  .map(l => l.split("\t"))
  .map(a => `${a[a.length - 2]}=${a[a.length - 1]}`).join("; ");

const BATCH = 6;
async function mine(batch, attempt = 1) {
  try {
    const res = await fetch("http://localhost:3000/api/speakers/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ eventIds: batch }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) {
      if (attempt < 2) { await new Promise(r => setTimeout(r, 3000)); return mine(batch, attempt + 1); }
      return { created: 0, updated: 0, err: j.error || res.status };
    }
    return j;
  } catch (e) {
    if (attempt < 2) { await new Promise(r => setTimeout(r, 3000)); return mine(batch, attempt + 1); }
    return { created: 0, updated: 0, err: String(e).slice(0, 80) };
  }
}

(async () => {
  let tc = 0, tu = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const r = await mine(batch);
    tc += r.created || 0; tu += r.updated || 0;
    console.log(`batch ${i / BATCH + 1}/${Math.ceil(ids.length / BATCH)}: created=${r.created ?? 0} updated=${r.updated ?? 0}${r.err ? " ERR:" + r.err : ""} (running created=${tc} updated=${tu})`);
  }
  console.log(`DONE. total created=${tc} updated=${tu}`);
})();
