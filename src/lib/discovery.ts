import { db } from "@/lib/db";
import { deriveGeo } from "@/lib/events";
import { isNomadEvent } from "@/lib/owner";

/* ── Robust JSON-array extractor ── */
function extractJsonArray(text: string): unknown[] | null {
  const tryParse = (s: string): unknown[] | null => {
    try { const p = JSON.parse(s); return Array.isArray(p) ? p : null; } catch { return null; }
  };
  const isObjArray = (a: unknown[]) => a.some((x) => x && typeof x === "object" && !Array.isArray(x));

  // 1. Whole response is the array.
  let p = tryParse(text.trim());
  if (p) return p;

  // 2. Fenced ```json code block.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { p = tryParse(fence[1].trim()); if (p && isObjArray(p)) return p; }

  // 3. Balanced-bracket scan: collect every complete top-level [...] array,
  //    ignoring brackets inside strings. Prefer the largest ARRAY OF OBJECTS
  //    (the events list) over inner string arrays like audienceSignals.
  const candidates: unknown[][] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "[") continue;
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "[") depth++;
      else if (c === "]") {
        depth--;
        if (depth === 0) { const arr = tryParse(text.slice(i, j + 1)); if (arr) candidates.push(arr); i = j; break; }
      }
    }
  }
  const objArrays = candidates.filter(isObjArray).sort((a, b) => b.length - a.length);
  if (objArrays.length) return objArrays[0];

  // 4. Last resort: first "[" to last "}", closed with "]".
  const start = text.indexOf("[");
  if (start !== -1) {
    const tail = text.slice(start);
    const lastBrace = tail.lastIndexOf("}");
    if (lastBrace !== -1) { p = tryParse(tail.slice(0, lastBrace + 1) + "]"); if (p) return p; }
  }
  return candidates.sort((a, b) => b.length - a.length)[0] ?? null;
}

type DiscoveredEvent = {
  title: string;
  type: string;
  startDate?: string | null;
  location?: string | null;
  isOnline?: boolean;
  region?: string | null;
  url?: string | null;
  cfpDeadline?: string | null;
  description?: string | null;
  coderRelevant?: boolean;
  isPaid?: boolean | null;
  paidNote?: string | null;
  ticketCost?: string | null;
  audienceDescription?: string | null;
  audienceSize?: number | null;
  otherSpeakers?: string | null;
  howToApply?: string | null;
  acceptanceLikelihood?: string | null;
  acceptanceRationale?: string | null;
  industry?: string | null;
  relevancyScore?: number | null;
  relevancyRationale?: string | null;
  suggestedAction?: string | null;
  category?: string | null;
  audienceSignals?: string[] | null;
  applyUrl?: string | null;
  attendUrl?: string | null;
  socialLinks?: Record<string, string | null> | null;
};

/* ── Shared speaker profile ── */
const SPEAKER_PROFILE = `Irmak Eyiceoglu — first-time speaker building a track record.
• Day job: EMEA Partner Manager at Coder (AI devtools / self-hosted cloud dev environments, $90M Series C). Partner events = networking in her Coder role, NOT personal speaking.
• Speaking credential: confirmed speaker at Nomad Cruise 17 AI Edition (Sept 2026, Atlantic crossing, 150 founders & digital nomads aboard Queen Mary 2).
• Best-fit topics: Sovereign AI, practical AI for non-technical founders/entrepreneurs, AI literacy for individuals.
• Realistic stage: meetups, podcasts, workshops, small summits, founder communities, entrepreneur events.
• NOT realistic yet: keynotes at AWS re:Invent, KubeCon, Microsoft Ignite, Gartner, large enterprise/developer mega-conferences.`;

/* ── Hard exclusion list — applied to BOTH discovery modes ── */
const EXCLUSION_BLOCK = `STRICT EXCLUSIONS — omit these from results entirely, even if found in search:
1. Cybersecurity / infosec / hacking events: FIRST, AFCEA, Black Hat, DEF CON, RSA Conference, TechNet Cyber, BSides, cybersecurity summits — UNLESS the event explicitly teaches AI to non-technical founders/individuals or is hosted by a tracked partner.
2. Single-vertical finance/banking events: Sibos, BAFT, Nacha, GFOA, AGA, CBA, GTR, Nacha — events for treasurers, payment professionals, or banking operations with no AI-for-entrepreneurs angle.
3. Telecoms / public-safety / transport events: PMRExpo, NASTD, APTAtech, InnoTrans, and similar narrow-vertical trade shows.
4. Government-sector procurement / budgeting events: NASBO, NASACT, NASCIO, ACT-IAC, and similar government IT buyer forums — unless they have a public AI education component open to outside speakers.
5. Academic / research ML conferences: ICML, NeurIPS, ICLR, ACL, EMNLP, CVPR, ICCV — very selective, wrong audience for this speaker.
6. Enterprise-software user conferences for a single vendor (Workday Rising, Salesforce Dreamforce, SAP Sapphire, ServiceNow Knowledge, Oracle CloudWorld) — attended by that vendor's customers, not entrepreneur/founder communities.
7. Utilities, broadcasting, retail, or supply-chain trade shows with no explicit AI-for-founders track.
Exception: include any excluded event type IF it is explicitly hosted or sponsored by one of the tracked EMEA partners and the request is for a partner-scoped discovery.`;

/* ── Shared scoring rubric ── */
const SCORING_RUBRIC = `RELEVANCY SCORE (0-100) — how realistic AND valuable for THIS speaker to get a speaking slot:

85-100 → Meetups, podcasts, workshops, founder/entrepreneur communities, digital nomad events, AI literacy events for individuals, small summits with open speaker tracks, podcasts interviewing AI educators/practitioners. She can realistically get in. suggestedAction: APPLY_TO_SPEAK.

65-84  → Medium-size tech/startup conferences with community tracks, lightning talks, or open CFPs; AI webinars; events where audience includes entrepreneurs or nontechnical founders; startup summits. Competitive but achievable. suggestedAction: APPLY_TO_SPEAK or BOTH.

40-64  → Larger tech conferences with open CFPs but high competition; events where her topics are adjacent; worth applying to niche/lightning tracks if available. suggestedAction: BOTH.

20-39  → Big enterprise/developer mega-conferences (AWS re:Invent, KubeCon, DockerCon, Microsoft Ignite, Gartner, Dreamforce, etc.) — attend for networking only, speaking unrealistic for first-timer. suggestedAction: ATTEND.

0-19   → Academic/research conferences; partner-hosted events (she attends as Coder EMEA Partner Manager for networking, not speaking); highly specialized technical events with no founder/entrepreneur audience. suggestedAction: ATTEND.

industry field: a short label for the vertical, e.g. "startups/entrepreneurship", "enterprise IT", "digital nomads", "fintech", "AI/ML research", "developer tools", "founder communities", "AI education", "sovereign AI", "corporate innovation".`;

/* ── Full JSON schema returned by Claude ── */
const SCHEMA_BLOCK = `Return a STRICT JSON array — nothing else, no markdown fences, no explanation. Each object:
{
  "title": "exact event name",
  "type": "CONFERENCE" | "MEETUP" | "EVENT" | "PODCAST" | "WEBINAR",
  "startDate": "YYYY-MM-DD or null",
  "location": "City, Country or null",
  "isOnline": true or false,
  "region": "Amsterdam/NL" | "Rest of Europe" | "London/UK" | "Austin" | "Bay Area" | "Online" | "Other",   // "Rest of Europe" = Belgium, Germany, Luxembourg, the Nordics, and other European countries outside NL & the UK. Use "London/UK" for events in London or anywhere in the United Kingdom. Use "Bay Area" for San Francisco, Silicon Valley, San Jose, Santa Clara, Oakland and the wider SF Bay Area.
  "url": "the official/main event home page URL (the page describing the event), or null",
  "cfpDeadline": "YYYY-MM-DD or null",
  "description": "1-2 sentences: what the event is",
  "coderRelevant": true if about devtools/enterprise software/AI infrastructure/cloud/developer tooling,
  "isPaid": true/false/null,
  "paidNote": "e.g. '€500 honorarium', 'travel covered', or null",
  "ticketCost": "cost to ATTEND / ticket price if findable, e.g. 'Free', '~€1,995', 'From €99', or null",
  "audienceDescription": "who the audience is, e.g. 'startup founders', 'ML engineers', 'enterprise CTOs', or null",
  "audienceSize": integer or null,
  "otherSpeakers": "notable confirmed or past speakers, or null",
  "howToApply": "CFP form URL, email address, LinkedIn DM, or brief description",
  "industry": "short vertical label per rubric above",
  "relevancyScore": 0-100 integer per rubric above,
  "relevancyRationale": "1-2 sentences explaining the score",
  "suggestedAction": "ATTEND" | "APPLY_TO_SPEAK" | "BOTH",
  "category": "ATTEND" | "PARTICIPATE" | "SPEAK",   // top-level track. SPEAK = a realistic personal speaking slot for Irmak (suggestedAction APPLY_TO_SPEAK/BOTH). PARTICIPATE = she'd go in her Coder role / Coder would sponsor or exhibit, or the audience is customers & partners (coderRelevant, partner events, enterprise/analyst events). ATTEND = she'd attend individually for her own learning/network, no Coder or speaking angle.
  "audienceSignals": ["DEVELOPERS" | "ENGINEERS" | "CUSTOMERS" | "ENTREPRENEURS" | "SMBS" | "PROFESSIONALS" | "WOMEN_IN_TECH" | "PARTNERS"],   // who attends; include every tag that clearly applies. WOMEN_IN_TECH for Women-in-Tech/AI communities. CUSTOMERS/PARTNERS when Coder's prospective customers or channel partners gather there.
  "acceptanceLikelihood": "HIGH" | "MEDIUM" | "LOW",
  "acceptanceRationale": "one sentence on likelihood of getting accepted",
  "applyUrl": "the DIRECT URL to the speaker application / CFP submission (SPEAK) page — the page where you submit a talk. Only include if you saw this specific URL in search results; null otherwise",
  "attendUrl": "the DIRECT URL to the attendee registration / ticket / RSVP (ATTEND) page — where an attendee signs up or buys a ticket. Only include if you saw this specific URL in search results; null otherwise",
  "socialLinks": { "linkedin": "URL or null", "instagram": "URL or null", "twitter": "URL or null", "youtube": "URL or null", "facebook": "URL or null" } — only include platforms you verified exist; omit or null platforms not found
}`;

export interface DiscoveryOptions {
  partnerId?: string;
  focus?: string;
  broad?: boolean;   // wide-net mode: ANY AI-related tech event + AI podcast
}

export interface DiscoveryOutcome {
  ok: boolean;
  runId: string;
  found?: number;
  total?: number;
  error?: string;
  status?: number;
}

/**
 * Run one discovery pass (partner-scoped if partnerId is given, otherwise a
 * general web search). Creates a DiscoveryRun, calls Claude with web search,
 * dedupes, and inserts new DISCOVERED events. Shared by the manual endpoint
 * and the automated cron job.
 */
export async function runDiscovery(opts: DiscoveryOptions = {}): Promise<DiscoveryOutcome> {
  const partnerId = opts.partnerId;
  const broad = opts.broad === true;
  const focus = typeof opts.focus === "string" ? opts.focus.trim().slice(0, 120) : "";

  let partner: { id: string; name: string; country: string } | null = null;
  if (partnerId) {
    partner = await db.partner.findUnique({
      where: { id: partnerId },
      select: { id: true, name: true, country: true },
    });
    if (!partner) return { ok: false, runId: "", error: "Partner not found", status: 404 };
  }

  const run = await db.discoveryRun.create({ data: { status: "RUNNING" } });
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  let prompt: string;

  if (partner) {
    prompt = `Today is ${todayStr}.

${SPEAKER_PROFILE}

${SCORING_RUBRIC}

EXCLUSIONS for partner mode: skip pure legal/compliance/tax webinars and narrow non-tech trade shows with no networking value for a developer-tools partnership. INCLUDE the partner's own summits, customer events, user conferences, tech/AI events, webinars, roadshows, and conferences they sponsor or speak at — these are exactly what we want here.

You are researching events linked to "${partner.name}" (headquartered in ${partner.country || "Europe"}) that Irmak could attend or speak at in her Coder partner-manager role.

Use MULTIPLE web searches (8-10) covering (today is ${today.toDateString()} — search the CURRENT and coming years, 2026, 2027 AND 2028, and only keep events dated from today onward through the end of 2028):
1. ${partner.name} official website — events/newsroom/webinar pages: "${partner.name} events 2026 2027 2028", "${partner.name} summit 2026 2027 2028", "${partner.name} upcoming events"
2. ${partner.name} LinkedIn events and posts announcing conferences, webinars, summits
3. "${partner.name} conference sponsor 2026 2027 2028", "${partner.name} speaking session 2026 2027 2028", "${partner.name} keynote"
4. Industry events in ${partner.country || "Europe"} where ${partner.name} participates or sponsors
5. "${partner.name} partner summit 2026 2027 2028", "${partner.name} customer event", "${partner.name} roadshow 2026 2027 2028"
6. "${partner.name} webinar 2026 2027 2028", "${partner.name} innovation summit"
7. meetup.com — "${partner.name} meetup", meetup groups the company hosts or organizes
8. lu.ma — "${partner.name} lu.ma", "${partner.name} luma calendar" (many boutique consultancies host their events on Luma)
9. eventbrite — "${partner.name} eventbrite" organizer page and upcoming events
10. Trade shows and expos where ${partner.name} exhibits: "${partner.name} exhibitor 2026 2027 2028", "${partner.name} booth"
11. BrightTALK webinars & talks hosted or presented by ${partner.name}: "${partner.name} BrightTALK", "brighttalk.com ${partner.name}", "${partner.name} BrightTALK webinar 2026 2027 2028" — include on-demand and upcoming BrightTALK sessions the partner runs (type WEBINAR, usually isOnline true).

Find events ${partner.name} HOSTS, SPONSORS, or SPEAKS AT. For each event, capture ALL THREE link types when findable: the official event page (url), the speaker/CFP application page (applyUrl), and the attendee registration/ticket page (attendUrl) — do NOT put a registration link in url; url is the main page only. Note: most partner events will be ATTEND (networking), but flag BOTH or APPLY_TO_SPEAK if there's genuinely an open speaker application track.
PRIORITISE events located in: Amsterdam/Netherlands, London/UK, the rest of Europe (Belgium, Germany, Luxembourg, Nordics), Austin TX, the San Francisco Bay Area / Silicon Valley, or ONLINE. Skip events elsewhere unless they are the partner's flagship annual event.

Only include events AFTER ${todayStr}.

${SCHEMA_BLOCK}`;
  } else if (broad) {
    prompt = `Today is ${todayStr}.

${SPEAKER_PROFILE}

${SCORING_RUBRIC}
${focus ? `\nPRIORITY FOCUS FOR THIS RUN: ${focus}. Weight the majority of your searches toward this theme, but still cast the wide net described below.\n` : ""}
WIDE-NET MODE: Scrape the web broadly for **ANY AI-related technology event and ANY AI-related podcast** — do NOT limit to founder/entrepreneur or non-technical audiences. Include the full spectrum: AI / machine learning / generative AI / LLM / data / MLOps / AI-infrastructure conferences, summits, expos, world tours, meetups, hackathons, workshops, bootcamps, webinars, and AI podcasts (especially shows that accept or interview guests). Include large developer/enterprise AI conferences AND small community meetups AND online webinars AND podcasts — anything genuinely about AI/ML technology.

Do NOT apply the narrow founder-only exclusions here. The ONLY things to skip are: (a) events with no real AI/technology component at all, and (b) anything you cannot verify is real via web search. Everything else about AI tech is in-scope; just score it honestly with the rubric (big dev/enterprise mega-conferences will score low / ATTEND, community and podcast slots score higher — that's fine, still include them).

Use MANY web searches (8-10) casting a wide net, for example:
1. "AI conference 2026 2027 2028", "machine learning summit 2026 2027 2028", "generative AI conference 2026 2027 2028", "LLM summit 2026 2027 2028", "AI expo 2026 2027 2028", "AI world tour 2026 2027 2028".
2. "AI meetup 2026" and "machine learning meetup" on meetup.com, lu.ma, and Eventbrite across Amsterdam/NL, London/UK, rest of Europe, Austin, the SF Bay Area, and Online.
3. "AI podcast 2026", "machine learning podcast guest", "generative AI podcast", "AI podcast accepting guests", "AI podcast call for guests 2026" — include notable AI podcasts and especially those inviting guests (type PODCAST, usually isOnline true, region "Online").
4. "AI hackathon 2026 2027 2028", "AI bootcamp 2026", "AI workshop 2026", "AI developer conference 2026 2027 2028".
5. Vendor & flagship AI events: "NVIDIA GTC 2026 2027", "AI Engineer 2026 2027", "MLOps World 2026", "World Summit AI 2026 2027", "The AI Summit 2026 2027", "Ai4 2026 2027", "ODSC 2026 2027", "Data + AI Summit 2026 2027", "AI DevWorld", "Applied Intelligence Live".
6. Regional AI events across Amsterdam/NL, London/UK, rest of Europe (Belgium, Germany, Nordics), Austin, and the SF Bay Area — plus major global AI events even outside those regions IF they are flagship.
7. "AI webinar 2026", online AI summits, virtual AI conferences.
8. Women in AI / diversity-in-AI events and podcasts.

Capture ALL THREE link types when findable: the official event page (url), the speaker/CFP application page (applyUrl), and the attendee registration/ticket page (attendUrl). For podcasts, put the guest-application / contact URL in applyUrl or howToApply.

Only include events AFTER ${todayStr} and up to the end of 2028 (recurring podcasts/meetups with no fixed date may use startDate null). Do NOT invent anything — every event and podcast must be real and verified via web search.

${SCHEMA_BLOCK}`;
  } else {
    prompt = `Today is ${todayStr}.

${SPEAKER_PROFILE}

${SCORING_RUBRIC}
${focus ? `\nPRIORITY FOCUS FOR THIS RUN: ${focus}. Weight the majority of your searches toward this theme (events, meetups, podcasts, and webinars), while still applying the speaker profile, scoring rubric, and exclusions below.\n` : ""}
${EXCLUSION_BLOCK}

Search the web for speaking opportunities for this speaker. Prioritise events where ENTREPRENEURS, FOUNDERS, INDIVIDUALS, and NONTECHNICAL PEOPLE learn about AI — not large developer/enterprise conferences.

Use MULTIPLE web searches (8-10) covering:

1. **Amsterdam/NL entrepreneur & AI meetups** — "Amsterdam AI founders meetup 2026", "Amsterdam entrepreneur meetup AI 2026", "AI literacy meetup Amsterdam", "nontechnical AI Amsterdam", "startup AI workshop Amsterdam", meetup.com Amsterdam AI/founders groups.

2. **lu.ma & Eventbrite founder/AI events** — "lu.ma Amsterdam founders AI 2026", "luma.events AI for founders online", "eventbrite Amsterdam startup AI 2026".

3. **Online podcasts & shows for founders/entrepreneurs about AI** — "AI podcast entrepreneurs guest 2026", "founder AI podcast guest application", "Sovereign AI podcast", "practical AI podcast non-technical", "AI for business podcast guests". Look for shows actively seeking AI educator guests.

4. **Digital nomad & remote entrepreneur events** — "Nomad Cruise 2027", "Remote Year AI", "nomad summit 2026", "digital nomad conference AI 2026", "founder retreat AI 2026 2027".

5. **London/UK AI & founder events** — "London AI founders meetup 2026", "London Tech Week 2027 speakers", "AI for founders London 2026", "UK AI startup summit speakers", "Sovereign AI London 2026", "AI entrepreneur event Manchester Edinburgh 2026". Tag these region "London/UK".

6. **Austin TX (all months, 2026–2028)** — search across the WHOLE year, not just the winter months: "Austin founder AI event 2026 2027 2028 speakers", "Austin entrepreneur AI summit", "Austin AI meetup [month] 2026 2027 2028", "Austin startup AI event spring summer fall 2026 2027 2028", "Austin tech conference AI 2026 2027 2028 speakers", "SXSW 2027 2028 speaker application AI entrepreneur", "Capital Factory Austin AI event", "Austin Startup Week 2026 2027". Cover every month (Jan–Dec) so we don't miss spring/summer/autumn events.

6b. **San Francisco Bay Area / Silicon Valley (all months, 2026–2028)** — "San Francisco AI founder event 2026 2027 2028 speakers", "Bay Area AI meetup 2026 2027 2028", "Silicon Valley startup AI summit 2026 2027 2028", "SF AI conference speakers 2026 2027 2028", "San Jose Santa Clara AI event 2026 2027 2028", "Bay Area founder community AI workshop", "AI Engineer Summit San Francisco", "SF Tech Week 2026 2027 2028". Cover every month. Tag these region "Bay Area".

7. **European AI education & founder communities** — "AI for founders summit Europe 2026 speakers", "European startup AI conference speakers", "AI literacy conference Europe CFP", "Women in AI event Europe speakers 2026", "Sovereign AI event Europe 2026".

7b. **Rest of Europe — Belgium, Germany, Luxembourg, Nordics** — "AI founders meetup Brussels 2026", "AI entrepreneur event Berlin 2026 speakers", "AI startup summit Munich 2026", "AI event Luxembourg 2026", "AI founder conference Copenhagen Stockholm Helsinki Oslo 2026 speakers", "Sovereign AI Germany Nordics 2026". Tag these region "Rest of Europe" (but tag UK events "London/UK").

7c. **Analyst & flagship industry events** — "Gartner summit Europe 2026 2027", "Gartner Digital Workplace Summit", "Gartner IT Symposium 2026 2027", "IDC Directions 2026 Europe", "IDC Summit Netherlands 2026", "IDC FutureScape 2026", "Forrester Technology & Innovation Summit EMEA 2026", "Forrester Summit 2026 2027", "GITEX Global 2026", "GITEX Europe Berlin 2026", "analyst AI summit Amsterdam London San Francisco 2026". Explicitly cover the big three analyst firms — GARTNER, IDC and FORRESTER — across EMEA, Austin, the Bay Area and Online. These are usually ATTEND (analyst relations, networking, Sovereign AI policy tracks) but flag speaker/panel application tracks when they exist. Include them even though they are enterprise-flavoured — they matter for her Coder partner-manager role; score them honestly (usually 20-45, ATTEND or BOTH).

7d. **Named community sources — Loop, Meetup, Luma, Eventbrite** — "Loop AI community event 2026", "Loop meetup AI founders 2026", "meetup.com AI founders 2026 Amsterdam London San Francisco Austin", "lu.ma AI founder event 2026", "eventbrite AI startup event 2026". Mine these community platforms for recurring AI / founder / developer meetups across all our regions (Amsterdam/NL, London/UK, Rest of Europe, Austin, Bay Area, Online).

8. **AI webinars & online workshops for nontechnical people** — "AI webinar nontechnical founders 2026 speakers", "practical AI workshop online 2026 presenter", "AI for business workshop facilitator".

9. **Amsterdam tech community** — "Techleap Netherlands AI 2026", "StartupAmsterdam event 2026 speakers", "Dutch startup AI event 2026", "Amsterdam founder community AI".

9b. **Women in Tech / Women in AI** — "Women in AI event Europe 2026 speakers", "Women in Tech conference Amsterdam London 2026 CFP", "Women in AI Awards 2026", "Women in Data Netherlands meetup", "female founders AI event 2026", "Women in Tech podcast guest 2026", "women in AI webinar 2026", "Girls in Tech / Ladies that UX / PyLadies / Women Who Code Amsterdam London". Include Women-in-Tech / Women-in-AI communities, meetups, podcasts (guest slots), webinars, and summits — these are strong first-speaker fits; score generously where there is an open speaker/guest track.

10. **BrightTALK webinars — Coder-relevant and partner-hosted** — "brighttalk.com AI developer productivity 2026", "BrightTALK cloud development environments webinar", "BrightTALK developer tools AI webinar 2026", "BrightTALK sovereign AI webinar", "BrightTALK platform engineering 2026", and searches for tracked partners' BrightTALK channels ("<partner> BrightTALK"). Include BrightTALK webinars that are (a) topically relevant to Coder — AI devtools, developer productivity, cloud dev environments, platform engineering, sovereign AI — or (b) hosted/presented by one of Coder's partners. These are almost always type WEBINAR, isOnline true, region "Online"; most are PARTICIPATE/ATTEND (coderRelevant), but flag APPLY_TO_SPEAK/BOTH if they openly invite guest presenters. Capture the direct brighttalk.com URL in url/applyUrl.

Only include events AFTER ${todayStr} and up to the end of 2028 — actively look ahead across 2026, 2027 AND 2028, not just the next few months. Prioritise events where she can realistically get a speaking slot (meetups, podcasts, small summits, founder communities). For each event capture all three link types when findable: the official event page (url), the speaker/CFP application page (applyUrl), and the attendee registration/ticket page (attendUrl); also put the CFP/application URL or contact in howToApply whenever findable.

${SCHEMA_BLOCK}`;
  }

  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN;

  if (!baseUrl || !authToken) {
    await db.discoveryRun.update({ where: { id: run.id }, data: { status: "ERROR", summary: "Anthropic credentials not configured", finishedAt: new Date() } });
    return { ok: false, runId: run.id, error: "Anthropic credentials not configured", status: 503 };
  }

  try {
    const response = await fetch(`${baseUrl}/v1/messages`, {
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

    if (!response.ok) {
      const errText = await response.text();
      await db.discoveryRun.update({ where: { id: run.id }, data: { status: "ERROR", summary: `LLM error: ${errText.slice(0, 500)}`, finishedAt: new Date() } });
      return { ok: false, runId: run.id, error: "LLM request failed", status: 502 };
    }

    const data = await response.json() as { content: Array<{ type: string; text?: string }> };
    const fullText = data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");

    const rawEvents = extractJsonArray(fullText);
    if (!rawEvents) {
      await db.discoveryRun.update({ where: { id: run.id }, data: { status: "ERROR", summary: "Could not parse JSON from LLM response", finishedAt: new Date() } });
      return { ok: false, runId: run.id, error: "Could not parse events" };
    }

    const events = rawEvents as DiscoveredEvent[];
    const existing = await db.event.findMany({ select: { title: true, url: true } });
    const existingTitles = new Set(existing.map((e) => e.title.toLowerCase()));
    const existingUrls = new Set(existing.filter((e) => e.url).map((e) => e.url!.toLowerCase()));

    const sourceNote = partner
      ? `Partner discovery: ${partner.name} — ${today.toDateString()}`
      : broad
      ? `Broad AI discovery${focus ? `: ${focus}` : ""} — ${today.toDateString()}`
      : focus
      ? `Focused discovery: ${focus} — ${today.toDateString()}`
      : `Auto-discovery run ${today.toDateString()}`;

    const todayMidnight = new Date(today);
    todayMidnight.setHours(0, 0, 0, 0);

    const validTypes = ["CONFERENCE", "MEETUP", "EVENT", "PODCAST", "WEBINAR"];
    const validLikelihoods = ["HIGH", "MEDIUM", "LOW"];
    const validActions = ["ATTEND", "APPLY_TO_SPEAK", "BOTH"];
    const validCategories = ["ATTEND", "PARTICIPATE", "SPEAK"];
    const validSignals = ["DEVELOPERS", "ENGINEERS", "CUSTOMERS", "ENTREPRENEURS", "SMBS", "PROFESSIONALS", "WOMEN_IN_TECH", "PARTNERS"];
    let inserted = 0;

    for (const ev of events) {
      if (!ev.title || !ev.type || !validTypes.includes(ev.type)) continue;
      if (existingTitles.has(ev.title.toLowerCase())) continue;
      if (ev.url && existingUrls.has(ev.url.toLowerCase())) continue;
      if (ev.startDate && new Date(ev.startDate) < todayMidnight) continue;

      const coderRelevant = partner ? true : (ev.coderRelevant ?? false);
      const likelihood = ev.acceptanceLikelihood && validLikelihoods.includes(ev.acceptanceLikelihood) ? ev.acceptanceLikelihood : null;
      const action = ev.suggestedAction && validActions.includes(ev.suggestedAction) ? ev.suggestedAction : null;
      const score = ev.relevancyScore != null ? Math.min(100, Math.max(0, Number(ev.relevancyScore))) : null;
      const category = ev.category && validCategories.includes(ev.category) ? ev.category : null;
      const signals = Array.isArray(ev.audienceSignals)
        ? ev.audienceSignals.map((s) => String(s).toUpperCase().replace(/[\s-]+/g, "_")).filter((s) => validSignals.includes(s))
        : [];

      const geo = deriveGeo({ location: ev.location, region: ev.region, title: ev.title, isOnline: ev.isOnline, type: ev.type });

      await db.event.create({
        data: {
          title: ev.title,
          type: ev.type as "CONFERENCE" | "MEETUP" | "EVENT" | "PODCAST" | "WEBINAR",
          startDate: ev.startDate ? new Date(ev.startDate) : null,
          location: ev.location ?? null,
          isOnline: ev.isOnline ?? false,
          region: geo.macroRegion,
          city: geo.city,
          url: ev.url ?? null,
          cfpDeadline: ev.cfpDeadline ? new Date(ev.cfpDeadline) : null,
          description: ev.description ?? null,
          coderRelevant,
          ownerOnly: isNomadEvent({ title: ev.title, description: ev.description, industry: ev.industry, audienceDescription: ev.audienceDescription }),
          status: "DISCOVERED",
          sourceNote,
          ...(partnerId ? { partner: { connect: { id: partnerId } } } : {}),
          isPaid: ev.isPaid ?? null,
          paidNote: ev.paidNote ?? null,
          ticketCost: ev.ticketCost ?? null,
          audienceDescription: ev.audienceDescription ?? null,
          audienceSize: ev.audienceSize != null ? Number(ev.audienceSize) : null,
          otherSpeakers: ev.otherSpeakers ?? null,
          howToApply: ev.howToApply ?? null,
          acceptanceLikelihood: likelihood,
          acceptanceRationale: ev.acceptanceRationale ?? null,
          applyUrl: ev.applyUrl ?? null,
          attendUrl: ev.attendUrl ?? null,
          socialLinks: ev.socialLinks ? JSON.stringify(ev.socialLinks) : null,
          industry: ev.industry ?? null,
          relevancyScore: score,
          relevancyRationale: ev.relevancyRationale ?? null,
          suggestedAction: action,
          category: category,
          audienceSignals: signals.length ? JSON.stringify([...new Set(signals)]) : null,
        },
      });

      existingTitles.add(ev.title.toLowerCase());
      if (ev.url) existingUrls.add(ev.url.toLowerCase());
      inserted++;
    }

    await db.discoveryRun.update({
      where: { id: run.id },
      data: { status: "DONE", found: inserted, summary: `Found ${inserted} new event(s) from ${events.length} candidate(s). ${partner ? `Partner: ${partner.name}` : focus ? `Focus: ${focus}` : "General search"}`, finishedAt: new Date() },
    });

    return { ok: true, runId: run.id, found: inserted, total: events.length };
  } catch (llmErr) {
    await db.discoveryRun.update({ where: { id: run.id }, data: { status: "ERROR", summary: String(llmErr), finishedAt: new Date() } });
    return { ok: false, runId: run.id, error: "Discovery failed", status: 500 };
  }
}

/**
 * Rotating focus themes for automated runs so each pass explores a different
 * slice instead of repeating the same search. Dedup handles overlaps.
 */
export const AUTO_FOCUS_THEMES = [
  "Women in Tech and Women in AI communities, meetups, podcasts and summits",
  "Amsterdam and Netherlands AI founder/entrepreneur meetups and workshops",
  "London and UK AI founder events, meetups and CFPs",
  "AI podcasts and online shows seeking guest speakers",
  "digital nomad and remote founder events with AI tracks",
  "Rest of Europe (Belgium, Germany, Nordics) AI founder events",
  "AI literacy and practical-AI-for-nontechnical-founders workshops and webinars",
  "startup and entrepreneur summits with open speaker tracks",
  "BrightTALK webinars relevant to Coder (AI devtools, developer productivity, cloud dev environments, platform engineering, sovereign AI) and partner-hosted BrightTALK sessions",
  "San Francisco Bay Area / Silicon Valley AI founder, developer and startup events across all months",
  "Analyst and flagship industry events — Gartner, IDC, Forrester summits across EMEA, Austin, Bay Area and Online",
];

/** Wide-net sub-themes for broad AI discovery (ANY AI tech event + podcast). */
export const BROAD_AI_THEMES = [
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

/** Pick a focus theme that rotates over time (changes every ~run). */
export function rotatingFocus(seed = Date.now()): string {
  const slot = Math.floor(seed / (1000 * 60 * 60 * 24 * 7)); // rotate weekly
  return AUTO_FOCUS_THEMES[slot % AUTO_FOCUS_THEMES.length];
}
