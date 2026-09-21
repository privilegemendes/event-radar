import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const todayStr = new Date().toISOString().slice(0, 10);
const baseUrl = process.env.ANTHROPIC_BASE_URL;
const authToken = process.env.ANTHROPIC_AUTH_TOKEN;

const PROFILE = `Irmak Eyiceoglu — EMEA Partner Manager at Coder (AI devtools / self-hosted cloud development environments). First-time speaker building a track record. Interests: Sovereign AI, practical AI for non-technical founders/entrepreneurs, AI literacy, developer productivity, platform engineering. She SPEAKS at meetups/podcasts/workshops/small summits, PARTICIPATES in Coder-relevant developer/enterprise/partner events, and ATTENDS analyst events (Gartner/IDC/Forrester).`;

// Distinct Bay Area slices — learn from the event types/themes we track, minimise overlap.
const BRIEFS = [
  ["Bay Area AI & developer conferences/summits", "Find major AI and developer CONFERENCES and summits in the San Francisco Bay Area / Silicon Valley (San Francisco, San Jose, Santa Clara, Oakland, Palo Alto, Mountain View) happening 2026-2027. Include: AI Engineer World's Fair/Summit, The AI Conference, TED AI SF, Ai4, Data + AI Summit, DeveloperWeek, API World, QCon SF, GraphQL/JS/Python confs, GitHub Universe, Nvidia GTC, LangChain Interrupt, Ray Summit, MLOps World, Scale/Databricks/OpenAI/Anthropic dev days. Aim for 20+."],
  ["Bay Area AI founder/entrepreneur meetups & communities", "Find recurring AI and founder/entrepreneur MEETUPS and community events in the SF Bay Area on meetup.com, Luma (lu.ma), Loop and Eventbrite: 'SF AI founders meetup', 'Cerebral Valley', 'AI Tinkerers San Francisco', 'Hugging Face SF', 'GenAI Collective', 'SF Tech Week', 'Founders Inc', 'South Park Commons', 'AGI House', 'Solaris AI', hackathons, and demo days. Aim for 20+ distinct groups/events."],
  ["Bay Area AI podcasts, webinars & AI-literacy workshops", "Find PODCASTS recorded in / around the SF Bay Area that host AI founders/practitioners as guests, plus online WEBINARS and practical AI / AI-literacy WORKSHOPS for non-technical founders run by Bay Area orgs (2026-2027). Include shows like Latent Space, No Priors, Cognitive Revolution, The AI Daily Brief, plus workshop series and webinars. Aim for 15+."],
  ["Bay Area Women in Tech / Women in AI", "Find Women-in-Tech and Women-in-AI events, meetups, summits, awards and podcasts in the SF Bay Area for 2026-2027: 'Women in AI SF', 'Girl Geek X', 'Women Who Code SF', 'Elpha', 'Women in Product', 'Grace Hopper adjacent Bay Area', 'AnitaB', 'PyLadies SF', female-founder AI events. Prefer open speaker/guest tracks. Aim for 15+."],
  ["Bay Area developer / platform-engineering / devtools (Coder-relevant)", "Find Bay Area events specifically about developer productivity, platform engineering, internal developer platforms, cloud development environments, DevOps/DevEx, Kubernetes and self-hosted AI (Coder-relevant, mostly PARTICIPATE): PlatformCon Live SF, KubeCon adjacent, DevOps Days SF/Silicon Valley, SREcon, DevEx meetups, CNCF Bay Area meetups, HashiConf, GitHub/GitLab events, backstage/IDP meetups. Aim for 15+."],
  ["Bay Area enterprise / analyst / vendor summits", "Find enterprise, ANALYST and major vendor events in the SF Bay Area / Silicon Valley 2026-2027 relevant to a Coder partner manager (mostly ATTEND/PARTICIPATE): Gartner, IDC, Forrester West/US summits held in CA; AWS/Google Cloud/Microsoft regional summits in SF/Santa Clara; Dreamforce, Salesforce/ServiceNow/Databricks/Snowflake events; RSA-adjacent AI governance; sovereign-AI policy events. Score honestly 20-45. Aim for 15+."],
  ["Bay Area startup / VC / demo-day & accelerator events", "Find SF Bay Area startup, VC and accelerator events for 2026-2027: Y Combinator demo day/adjacent, Techstars, 500 Global, Startup Grind SF, SaaStr Annual (San Mateo), Founder events, pitch nights, angel/VC AI summits, and entrepreneur conferences. Flag open speaker tracks as SPEAK. Aim for 15+."],
];

function extract(text) {
  const ms = text.match(/\[[\s\S]*\]/g) || [];
  for (const m of ms.sort((a, b) => b.length - a.length)) {
    try { const p = JSON.parse(m); if (Array.isArray(p)) return p; } catch {}
  }
  return [];
}

async function callClaude(brief) {
  const prompt = `Today is ${todayStr}.

${PROFILE}

TASK: ${brief}

Do 9-10 DISTINCT web searches. Only real events you can find online, with findable URLs. Only include events dated AFTER ${todayStr} (or null date for genuinely recurring meetups/podcasts). Return a STRICT JSON array — nothing else. Each object:
{
  "title": "exact event name",
  "type": "CONFERENCE" | "MEETUP" | "EVENT" | "PODCAST" | "WEBINAR",
  "startDate": "YYYY-MM-DD or null",
  "location": "City, CA or null",
  "isOnline": true or false,
  "region": "Bay Area" (or "Online" only if purely virtual),
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
Aim for 20+ distinct real events.`;

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
      max_tokens: 20000,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 10 }],
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) { console.log("  LLM error", res.status, (await res.text()).slice(0, 160)); return []; }
  const data = await res.json();
  const text = data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
  return extract(text);
}

const existing = await db.event.findMany({ select: { title: true, url: true } });
const titles = new Set(existing.map((e) => e.title.toLowerCase()));
const urls = new Set(existing.filter((e) => e.url).map((e) => e.url.toLowerCase()));
const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
const vType = ["CONFERENCE", "MEETUP", "EVENT", "PODCAST", "WEBINAR"];
const vAction = ["ATTEND", "APPLY_TO_SPEAK", "BOTH"];
const vCat = ["ATTEND", "PARTICIPATE", "SPEAK"];
const vRegion = ["Amsterdam/NL", "Rest of Europe", "London/UK", "Austin", "Bay Area", "Online", "Other"];
const vSig = ["DEVELOPERS", "ENGINEERS", "CUSTOMERS", "ENTREPRENEURS", "SMBS", "PROFESSIONALS", "WOMEN_IN_TECH", "PARTNERS"];

let grand = 0;
for (const [label, brief] of BRIEFS) {
  console.log(`\n=== ${label} ===`);
  let arr = [];
  try { arr = await callClaude(brief); } catch (e) { console.log("  call failed:", String(e).slice(0, 120)); }
  console.log("  candidates:", arr.length);
  let ins = 0;
  for (const ev of arr) {
    if (!ev.title || !ev.type || !vType.includes(ev.type)) continue;
    if (titles.has(ev.title.toLowerCase())) continue;
    if (ev.url && urls.has(ev.url.toLowerCase())) continue;
    if (ev.startDate && new Date(ev.startDate) < todayMid) continue;
    const region = vRegion.includes(ev.region) ? ev.region : (ev.isOnline ? "Online" : "Bay Area");
    const category = vCat.includes(ev.category) ? ev.category : null;
    const action = vAction.includes(ev.suggestedAction) ? ev.suggestedAction : null;
    const score = ev.relevancyScore != null ? Math.min(100, Math.max(0, Number(ev.relevancyScore))) : null;
    const sig = Array.isArray(ev.audienceSignals)
      ? [...new Set(ev.audienceSignals.map((s) => String(s).toUpperCase().replace(/[\s-]+/g, "_")).filter((s) => vSig.includes(s)))]
      : [];
    await db.event.create({
      data: {
        title: ev.title, type: ev.type,
        startDate: ev.startDate ? new Date(ev.startDate) : null,
        location: ev.location ?? null, isOnline: ev.isOnline ?? false, region,
        url: ev.url ?? null, cfpDeadline: ev.cfpDeadline ? new Date(ev.cfpDeadline) : null,
        description: ev.description ?? null, coderRelevant: !!ev.coderRelevant,
        status: "DISCOVERED", sourceNote: `Bay Area deep sweep (${label}) — ${new Date().toDateString()}`,
        audienceDescription: ev.audienceDescription ?? null, howToApply: ev.howToApply ?? null,
        suggestedAction: action, category,
        audienceSignals: sig.length ? JSON.stringify(sig) : null,
        industry: ev.industry ?? null, relevancyScore: score,
        relevancyRationale: ev.relevancyRationale ?? null, applyUrl: ev.applyUrl ?? ev.url ?? null,
      },
    });
    titles.add(ev.title.toLowerCase());
    if (ev.url) urls.add(ev.url.toLowerCase());
    ins++; grand++;
    console.log("  +", ev.startDate || "undated", "|", region, "|", ev.title);
  }
  console.log("  inserted:", ins);
}
console.log("\nGRAND TOTAL INSERTED:", grand);
console.log("Bay Area now:", await db.event.count({ where: { region: "Bay Area" } }));
await db.$disconnect();
