import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const todayStr = new Date().toISOString().slice(0, 10);

// Config via env: SEED_BRIEF (what to search), SEED_REGION (default region tag), SEED_SOURCE (sourceNote label)
const brief = process.env.SEED_BRIEF;
const defaultRegion = process.env.SEED_REGION || null;
const sourceLabel = process.env.SEED_SOURCE || "Discovery";
if (!brief) { console.error("Set SEED_BRIEF"); process.exit(1); }

const SPEAKER_PROFILE = `Irmak Eyiceoglu — EMEA Partner Manager at Coder (AI devtools / self-hosted cloud development environments). First-time speaker building a track record. Best-fit topics: Sovereign AI, practical AI for non-technical founders/entrepreneurs, AI literacy. Realistic speaking stage: meetups, podcasts, workshops, small summits, founder communities. She also ATTENDS enterprise/analyst events (Gartner, IDC, Forrester) for her Coder partner-manager role.`;

const prompt = `Today is ${todayStr}.

${SPEAKER_PROFILE}

TASK: ${brief}

Do 8-10 web searches. Include events with real, findable URLs. Only include events dated AFTER ${todayStr} (or null date if genuinely recurring). For enterprise/analyst/partner events that are not realistic speaking slots, still include them but mark category ATTEND or PARTICIPATE and score honestly (20-45). For meetups/podcasts/workshops with open speaker tracks, mark SPEAK and score generously.

Return a STRICT JSON array — nothing else, no markdown fences. Each object:
{
  "title": "exact event name",
  "type": "CONFERENCE" | "MEETUP" | "EVENT" | "PODCAST" | "WEBINAR",
  "startDate": "YYYY-MM-DD or null",
  "location": "City, Country or null",
  "isOnline": true or false,
  "region": "Amsterdam/NL" | "Rest of Europe" | "London/UK" | "Austin" | "Bay Area" | "Online" | "Other",
  "url": "direct URL or null",
  "cfpDeadline": "YYYY-MM-DD or null",
  "description": "1-2 sentences",
  "coderRelevant": true or false,
  "audienceDescription": "who attends or null",
  "howToApply": "CFP/registration URL, email, or brief description",
  "industry": "short vertical label",
  "relevancyScore": 0-100 integer,
  "relevancyRationale": "1 sentence",
  "suggestedAction": "ATTEND" | "APPLY_TO_SPEAK" | "BOTH",
  "category": "ATTEND" | "PARTICIPATE" | "SPEAK",
  "audienceSignals": ["DEVELOPERS"|"ENGINEERS"|"CUSTOMERS"|"ENTREPRENEURS"|"SMBS"|"PROFESSIONALS"|"WOMEN_IN_TECH"|"PARTNERS"],
  "applyUrl": "direct application/registration URL or null"
}
Aim for 12+ distinct real events.`;

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
const validRegions = ["Amsterdam/NL", "Rest of Europe", "London/UK", "Austin", "Bay Area", "Online", "Other"];
const validSignals = ["DEVELOPERS", "ENGINEERS", "CUSTOMERS", "ENTREPRENEURS", "SMBS", "PROFESSIONALS", "WOMEN_IN_TECH", "PARTNERS"];

let inserted = 0;
for (const ev of arr) {
  if (!ev.title || !ev.type || !validTypes.includes(ev.type)) { console.log("skip invalid:", ev.title); continue; }
  if (titles.has(ev.title.toLowerCase())) { console.log("skip dup:", ev.title); continue; }
  if (ev.url && urls.has(ev.url.toLowerCase())) { console.log("skip dup url:", ev.title); continue; }
  if (ev.startDate && new Date(ev.startDate) < todayMid) { console.log("skip past:", ev.title, ev.startDate); continue; }

  const region = validRegions.includes(ev.region) ? ev.region : (defaultRegion || (ev.isOnline ? "Online" : null));
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
      location: ev.location ?? null,
      isOnline: ev.isOnline ?? false,
      region,
      url: ev.url ?? null,
      cfpDeadline: ev.cfpDeadline ? new Date(ev.cfpDeadline) : null,
      description: ev.description ?? null,
      coderRelevant: !!ev.coderRelevant,
      status: "DISCOVERED",
      sourceNote: `${sourceLabel} — ${new Date().toDateString()}`,
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
  inserted++;
  console.log("+ inserted:", ev.startDate || "undated", "|", region, "|", ev.title);
}
console.log("INSERTED:", inserted);
await db.$disconnect();
