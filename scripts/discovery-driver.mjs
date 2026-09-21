import fs from "fs";

const BASE = "http://localhost:3000";
const LOG = "/tmp/discovery-driver.log";
const CKPT = "/tmp/discovery-checkpoint.json";
const EMAIL = "irmak@coder.com";
const PASSWORD = "change-me-now";

const BROAD_AI_THEMES = [
  "major AI, machine learning and generative AI conferences and summits worldwide 2026-2028",
  "AI and machine learning meetups on meetup.com, lu.ma and Eventbrite across Amsterdam, London, Europe, Austin, Bay Area and online",
  "AI and machine learning podcasts, including shows that accept or interview guests",
  "generative AI and LLM developer conferences, workshops, bootcamps and hackathons",
  "AI infrastructure, MLOps and data+AI engineering conferences and webinars",
  "vendor and flagship AI events (NVIDIA GTC, AI Engineer, World Summit AI, Ai4, ODSC, The AI Summit, Data + AI Summit)",
  "online AI webinars, virtual AI summits and streaming AI events",
  "European AI conferences and meetups (Netherlands, UK, Germany, Belgium, Nordics)",
  "US AI conferences and meetups (Austin, San Francisco Bay Area, New York)",
  "Women in AI and diversity-in-AI events, communities and podcasts",
];

function log(m) {
  const line = `${new Date().toISOString().slice(11, 19)} ${m}`;
  console.log(line);
  fs.appendFileSync(LOG, line + "\n");
}
const loadCkpt = () => { try { return new Set(JSON.parse(fs.readFileSync(CKPT, "utf8"))); } catch { return new Set(); } };
const saveCkpt = (s) => fs.writeFileSync(CKPT, JSON.stringify([...s]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let cookie = "";
async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const setc = res.headers.get("set-cookie") || "";
  const m = setc.match(/session=[^;]+/);
  if (!m) throw new Error("login failed: no session cookie");
  cookie = m[0];
  log("logged in");
}

async function waitReady() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${BASE}/api/auth/me`);
      if (r.status === 200 || r.status === 401) return;
    } catch {}
    await sleep(2000);
  }
  throw new Error("dev server not ready");
}

// One discovery call with retry + re-login on 401.
async function discover(payload, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${BASE}/api/discovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(payload),
      });
      if (res.status === 401 || res.status === 403) { await login(); continue; }
      const txt = await res.text();
      let j; try { j = JSON.parse(txt); } catch { j = { raw: txt.slice(0, 120) }; }
      if (j.ok) { log(`  OK ${label}: +${j.found} new of ${j.total}`); return j.found || 0; }
      log(`  ERR ${label} (attempt ${attempt}): ${j.error || j.raw || res.status}`);
    } catch (e) {
      log(`  FETCH-FAIL ${label} (attempt ${attempt}): ${String(e).slice(0, 80)}`);
    }
    await sleep(4000);
  }
  return 0;
}

async function main() {
  await waitReady();
  await login();
  const done = loadCkpt();
  let totalNew = 0;

  // 1) Broad-AI themes (ANY AI tech event + podcast).
  for (let i = 0; i < BROAD_AI_THEMES.length; i++) {
    const key = `broad:${i}`;
    if (done.has(key)) { log(`skip ${key} (done)`); continue; }
    log(`BROAD ${i + 1}/${BROAD_AI_THEMES.length}: ${BROAD_AI_THEMES[i].slice(0, 60)}`);
    totalNew += await discover({ broad: true, focus: BROAD_AI_THEMES[i] }, key);
    done.add(key); saveCkpt(done);
    await sleep(2000);
  }

  // 2) Partner sweep (Tech Alliance first, then the rest), resumable.
  const pr = await fetch(`${BASE}/api/partners`, { headers: { Cookie: cookie } });
  let partners = await pr.json();
  partners = partners.sort((a, b) =>
    (a.category === "Tech Alliance" ? 0 : 1) - (b.category === "Tech Alliance" ? 0 : 1) ||
    a.name.localeCompare(b.name));
  log(`partner sweep: ${partners.length} partners`);
  for (let i = 0; i < partners.length; i++) {
    const p = partners[i];
    const key = `partner:${p.id}`;
    if (done.has(key)) continue;
    log(`PARTNER ${i + 1}/${partners.length}: ${p.name}`);
    totalNew += await discover({ partnerId: p.id }, `${p.name}`);
    done.add(key); saveCkpt(done);
    await sleep(1500);
  }

  log(`DONE. total new events this run: ${totalNew}`);
}

main().catch((e) => { log("DRIVER CRASH: " + String(e)); process.exit(1); });
