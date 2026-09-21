import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const todayStr = new Date().toISOString().slice(0, 10);

const prompt = `Today is ${todayStr}.

You are curating BrightTALK (brighttalk.com) webinars for Coder — an AI developer-tools / self-hosted cloud development environments company. We want two kinds of BrightTALK webinars added to a tracking list:
(a) Webinars TOPICALLY RELEVANT to Coder: AI developer productivity, cloud development environments (CDEs), platform engineering, internal developer platforms, DevOps/DevEx, Kubernetes for developers, secure software development, sovereign AI, self-hosted AI.
(b) Webinars HOSTED or PRESENTED by companies that partner with enterprise devtools/cloud vendors.

Do 8-10 web searches across brighttalk.com to find UPCOMING (2026) and recent on-demand webinars of these kinds. Prefer ones with real, findable brighttalk.com URLs.

Return a STRICT JSON array — nothing else, no markdown fences. Each object:
{
  "title": "exact webinar title",
  "startDate": "YYYY-MM-DD or null",
  "url": "direct brighttalk.com URL",
  "description": "1-2 sentences on what it covers",
  "audienceDescription": "who attends, e.g. 'platform engineers', 'DevOps leaders', 'enterprise CTOs' or null",
  "coderRelevant": true or false,
  "category": "PARTICIPATE" or "ATTEND",  // PARTICIPATE if coderRelevant (Coder's audience/partners gather there); ATTEND otherwise
  "audienceSignals": ["DEVELOPERS"|"ENGINEERS"|"CUSTOMERS"|"PROFESSIONALS"|"PARTNERS"],
  "industry": "short vertical label, e.g. 'developer tools', 'platform engineering', 'cloud', 'devsecops', 'AI/ML'",
  "relevancyScore": 0-100 integer (how relevant/valuable for Coder to track),
  "relevancyRationale": "one sentence"
}
Return as many DISTINCT real BrightTALK webinars as you can find (aim for 12+).`;

const baseUrl = process.env.ANTHROPIC_BASE_URL;
const authToken = process.env.ANTHROPIC_AUTH_TOKEN;

const res = await fetch(`${baseUrl}/v1/messages`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
    "anthropic-beta": "web-search-2025-03-05",
    Authorization: `Bearer ${authToken}`,
    "x-api-key": authToken,
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-5",
    max_tokens: 16000,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 10 }],
    messages: [{ role: "user", content: prompt }],
  }),
});

const data = await res.json();
const fullText = data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
const matches = fullText.match(/\[[\s\S]*\]/g) || [];
let arr = [];
for (const m of matches.sort((a, b) => b.length - a.length)) {
  try { const p = JSON.parse(m); if (Array.isArray(p)) { arr = p; break; } } catch {}
}
console.log("candidates:", arr.length);

const existing = await db.event.findMany({ select: { title: true, url: true } });
const titles = new Set(existing.map((e) => e.title.toLowerCase()));
const urls = new Set(existing.filter((e) => e.url).map((e) => e.url.toLowerCase()));
const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
const validSignals = ["DEVELOPERS", "ENGINEERS", "CUSTOMERS", "SMBS", "PROFESSIONALS", "WOMEN_IN_TECH", "PARTNERS", "ENTREPRENEURS"];

let inserted = 0;
for (const ev of arr) {
  if (!ev.title || !ev.url) continue;
  if (titles.has(ev.title.toLowerCase())) { console.log("skip dup title:", ev.title); continue; }
  if (urls.has(ev.url.toLowerCase())) { console.log("skip dup url:", ev.title); continue; }
  if (ev.startDate && new Date(ev.startDate) < todayMid) { console.log("skip past:", ev.title); continue; }

  const coderRelevant = !!ev.coderRelevant;
  const category = ev.category === "PARTICIPATE" || ev.category === "ATTEND" ? ev.category : (coderRelevant ? "PARTICIPATE" : "ATTEND");
  const signals = Array.isArray(ev.audienceSignals)
    ? [...new Set(ev.audienceSignals.map((s) => String(s).toUpperCase().replace(/[\s-]+/g, "_")).filter((s) => validSignals.includes(s)))]
    : [];
  const score = ev.relevancyScore != null ? Math.min(100, Math.max(0, Number(ev.relevancyScore))) : null;

  await db.event.create({
    data: {
      title: ev.title,
      type: "WEBINAR",
      startDate: ev.startDate ? new Date(ev.startDate) : null,
      location: "Online",
      isOnline: true,
      region: "Online",
      url: ev.url,
      description: ev.description ?? null,
      coderRelevant,
      status: "DISCOVERED",
      sourceNote: `BrightTALK discovery — ${new Date().toDateString()}`,
      audienceDescription: ev.audienceDescription ?? null,
      howToApply: "Register on BrightTALK",
      suggestedAction: "ATTEND",
      category,
      audienceSignals: signals.length ? JSON.stringify(signals) : null,
      industry: ev.industry ?? null,
      relevancyScore: score,
      relevancyRationale: ev.relevancyRationale ?? null,
      applyUrl: ev.url,
    },
  });
  titles.add(ev.title.toLowerCase());
  urls.add(ev.url.toLowerCase());
  inserted++;
  console.log("+ inserted:", ev.title);
}
console.log("INSERTED:", inserted);
await db.$disconnect();
