import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const todayStr = new Date().toISOString().slice(0, 10);

const SPEAKER_PROFILE = `Irmak Eyiceoglu — first-time speaker building a track record.
• Day job: EMEA Partner Manager at Coder (AI devtools / self-hosted cloud dev environments).
• Best-fit topics: Sovereign AI, practical AI for non-technical founders/entrepreneurs, AI literacy.
• Realistic stage: meetups, podcasts, workshops, small summits, founder communities, entrepreneur events.
• NOT realistic yet: keynotes at huge enterprise/developer mega-conferences.`;

const prompt = `Today is ${todayStr}.

${SPEAKER_PROFILE}

Find events in AUSTIN, TEXAS across the ENTIRE time range from now through the end of 2027 — EVERY month (Jan–Dec), not just the winter months. Do 8-10 web searches spread across spring, summer, autumn, and winter:
- "Austin AI founder event <month> 2026 2027 speakers" for various months
- "Austin entrepreneur AI summit 2026 2027"
- "Austin startup week 2026 2027", "Capital Factory Austin AI event 2026 2027"
- "Austin tech conference AI 2026 2027 speakers", "Austin AI meetup 2026 2027"
- "SXSW 2027 speaker application AI entrepreneur"
- "Austin founder community AI workshop 2026 2027"
Prioritise events where an early-career speaker can realistically get a slot (meetups, podcasts, workshops, small summits, founder communities), but also include larger Austin tech/AI conferences (mark those ATTEND).

Return a STRICT JSON array — nothing else, no markdown fences. Each object:
{
  "title": "exact event name",
  "type": "CONFERENCE" | "MEETUP" | "EVENT" | "PODCAST" | "WEBINAR",
  "startDate": "YYYY-MM-DD or null",
  "location": "Austin, TX",
  "isOnline": false,
  "region": "Austin",
  "url": "direct URL or null",
  "cfpDeadline": "YYYY-MM-DD or null",
  "description": "1-2 sentences",
  "coderRelevant": true or false,
  "audienceDescription": "who attends or null",
  "howToApply": "CFP/registration URL, email, or brief description",
  "industry": "short vertical label",
  "relevancyScore": 0-100 integer (how realistic AND valuable to get a speaking slot),
  "relevancyRationale": "1 sentence",
  "suggestedAction": "ATTEND" | "APPLY_TO_SPEAK" | "BOTH",
  "category": "ATTEND" | "PARTICIPATE" | "SPEAK",
  "audienceSignals": ["DEVELOPERS"|"ENGINEERS"|"CUSTOMERS"|"ENTREPRENEURS"|"SMBS"|"PROFESSIONALS"|"WOMEN_IN_TECH"|"PARTNERS"],
  "applyUrl": "direct application/registration URL or null"
}
Only include events with a date AFTER ${todayStr} (or null date if genuinely recurring). Aim for 12+ distinct real Austin events spread across the whole date range.`;

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
const validTypes = ["CONFERENCE", "MEETUP", "EVENT", "PODCAST", "WEBINAR"];
const validActions = ["ATTEND", "APPLY_TO_SPEAK", "BOTH"];
const validCategories = ["ATTEND", "PARTICIPATE", "SPEAK"];
const validSignals = ["DEVELOPERS", "ENGINEERS", "CUSTOMERS", "ENTREPRENEURS", "SMBS", "PROFESSIONALS", "WOMEN_IN_TECH", "PARTNERS"];

const byMonth = {};
let inserted = 0;
for (const ev of arr) {
  if (!ev.title || !ev.type || !validTypes.includes(ev.type)) { console.log("skip invalid:", ev.title); continue; }
  if (titles.has(ev.title.toLowerCase())) { console.log("skip dup title:", ev.title); continue; }
  if (ev.url && urls.has(ev.url.toLowerCase())) { console.log("skip dup url:", ev.title); continue; }
  if (ev.startDate && new Date(ev.startDate) < todayMid) { console.log("skip past:", ev.title, ev.startDate); continue; }

  const category = validCategories.includes(ev.category) ? ev.category : null;
  const action = validActions.includes(ev.suggestedAction) ? ev.suggestedAction : null;
  const score = ev.relevancyScore != null ? Math.min(100, Math.max(0, Number(ev.relevancyScore))) : null;
  const signals = Array.isArray(ev.audienceSignals)
    ? [...new Set(ev.audienceSignals.map((s) => String(s).toUpperCase().replace(/[\s-]+/g, "_")).filter((s) => validSignals.includes(s)))]
    : [];

  await db.event.create({
    data: {
      title: ev.title,
      type: ev.type,
      startDate: ev.startDate ? new Date(ev.startDate) : null,
      location: ev.location ?? "Austin, TX",
      isOnline: ev.isOnline ?? false,
      region: "Austin",
      url: ev.url ?? null,
      cfpDeadline: ev.cfpDeadline ? new Date(ev.cfpDeadline) : null,
      description: ev.description ?? null,
      coderRelevant: !!ev.coderRelevant,
      status: "DISCOVERED",
      sourceNote: `Austin discovery (all months) — ${new Date().toDateString()}`,
      audienceDescription: ev.audienceDescription ?? null,
      howToApply: ev.howToApply ?? null,
      suggestedAction: action,
      category,
      audienceSignals: signals.length ? JSON.stringify(signals) : null,
      industry: ev.industry ?? null,
      relevancyScore: score,
      relevancyRationale: ev.relevancyRationale ?? null,
      applyUrl: ev.applyUrl ?? ev.url ?? null,
    },
  });
  titles.add(ev.title.toLowerCase());
  if (ev.url) urls.add(ev.url.toLowerCase());
  const mk = ev.startDate ? ev.startDate.slice(0, 7) : "undated";
  byMonth[mk] = (byMonth[mk] || 0) + 1;
  inserted++;
  console.log("+ inserted:", ev.startDate || "undated", "|", ev.title);
}
console.log("INSERTED:", inserted);
console.log("by month:", JSON.stringify(byMonth));
await db.$disconnect();
