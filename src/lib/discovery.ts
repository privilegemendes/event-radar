import { db } from "@/lib/db";
import { deriveGeo } from "@/lib/events";
import { profileFromRow } from "@/lib/profile-schema";
import {
  buildCatalogueScope,
  mergeProfilesForCatalogue,
  buildExclusions,
  buildGeographyLine,
  buildSearchPlan,
  buildFocusThemes,
  rotatingFocusFrom,
  parseList,
  isPrivateEvent,
} from "@/lib/speaker-brief";

/**
 * Discovery: the shared catalogue pass.
 *
 * Phase 4 split this in two. Discovery used to find events AND score them, in
 * one expensive web-search call, against whichever single speaker's brief it
 * happened to run with — so every speaker was handed the same score, correct
 * for at most one of them, and a second speaker meant a second web-search bill
 * for events that are identical for everyone.
 *
 * Finding is shareable; judging is not. So this pass now reports only facts
 * anyone would agree on — what the event is, when, where, who attends, what it
 * costs, how to apply — and writes one unscored opportunity row per speaker.
 * `scoreForSpeaker` in scoring.ts then judges those rows per speaker, with no
 * web search at all, which is what makes a second speaker cheap.
 */

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
  isPaid?: boolean | null;
  paidNote?: string | null;
  ticketCost?: string | null;
  audienceDescription?: string | null;
  audienceSize?: number | null;
  otherSpeakers?: string | null;
  howToApply?: string | null;
  industry?: string | null;
  audienceSignals?: string[] | null;
  applyUrl?: string | null;
  attendUrl?: string | null;
  socialLinks?: Record<string, string | null> | null;
};

/* ── Full JSON schema returned by Claude ── */
const SCHEMA_BLOCK = `Return a STRICT JSON array — nothing else, no markdown fences, no explanation. Each object:
{
  "title": "exact event name",
  "type": "CONFERENCE" | "MEETUP" | "EVENT" | "PODCAST" | "WEBINAR",
  "startDate": "YYYY-MM-DD or null",
  "location": "City, Country or null",
  "isOnline": true or false,
  "region": "the broad region in plain words (e.g. \"Netherlands\", \"United Kingdom\", \"California\"), or \"Online\"",   // free text: the app normalises this to a macro region and a city from location + region + title.
  "url": "the official/main event home page URL (the page describing the event), or null",
  "cfpDeadline": "YYYY-MM-DD or null",
  "description": "1-2 sentences: what the event is",
  "isPaid": true/false/null,
  "paidNote": "e.g. '€500 honorarium', 'travel covered', or null",
  "ticketCost": "cost to ATTEND / ticket price if findable, e.g. 'Free', '~€1,995', 'From €99', or null",
  "audienceDescription": "who the audience is, e.g. 'startup founders', 'ML engineers', 'enterprise CTOs', or null",
  "audienceSize": integer or null,
  "otherSpeakers": "notable confirmed or past speakers, or null",
  "howToApply": "CFP form URL, email address, LinkedIn DM, or brief description",
  "industry": "short vertical label for the event's sector, e.g. 'fintech', 'healthtech', 'devtools', or null",
  "audienceSignals": ["DEVELOPERS" | "ENGINEERS" | "CUSTOMERS" | "ENTREPRENEURS" | "SMBS" | "PROFESSIONALS" | "WOMEN_IN_TECH" | "PARTNERS"],   // who actually attends; include every tag that clearly applies. WOMEN_IN_TECH for Women-in-Tech/AI communities. This is an observation about the crowd, not a recommendation.
  "applyUrl": "the DIRECT URL to the speaker application / CFP submission (SPEAK) page — the page where you submit a talk. Only include if you saw this specific URL in search results; null otherwise",
  "attendUrl": "the DIRECT URL to the attendee registration / ticket / RSVP (ATTEND) page — where an attendee signs up or buys a ticket. Only include if you saw this specific URL in search results; null otherwise",
  "socialLinks": { "linkedin": "URL or null", "instagram": "URL or null", "twitter": "URL or null", "youtube": "URL or null", "facebook": "URL or null" } — only include platforms you verified exist; omit or null platforms not found
}

Every field above is a FACT about the event, verifiable by anyone. Do not add a
score, a rating, a ranking, a recommendation or a fit assessment — not as a
field, not in the description, not in any prose. Leave a field null rather than
guessing at it.`;

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
  const searchYear = today.getFullYear();

  /* The catalogue covers every speaker, so the prompt is built from the union
     of their briefs rather than one person's. With no profiles at all this is
     EMPTY_PROFILE, which the builders render as a coherent unfiltered prompt. */
  const speakerRows = await db.speakerProfile.findMany();
  const profiles = speakerRows.map((row) => profileFromRow(row as unknown as Record<string, unknown>));
  const catalogue = mergeProfilesForCatalogue(profiles);

  const scopeBlock     = buildCatalogueScope(catalogue);
  const exclusionBlock = buildExclusions(catalogue);
  const geographyLine  = buildGeographyLine(catalogue);
  const searchPlan     = buildSearchPlan(catalogue, searchYear);
  const lastYear = searchYear + 2;

  /* Privacy is per speaker: each speaker's own keywords decide what is hidden
     in THEIR view. Kept out of the prompt entirely — it is a local rule, not
     something the model should be told about or asked to apply. */
  const speakers = speakerRows.map((row) => ({
    userId: row.userId,
    privateKeywords: parseList(row.privateKeywords),
  }));

  let prompt: string;

  if (partner) {
    prompt = `Today is ${todayStr}.

${scopeBlock}

EXCLUSIONS for partner mode: skip pure legal/compliance/tax webinars and narrow non-tech trade shows with no networking value for a developer-tools partnership. INCLUDE the partner's own summits, customer events, user conferences, tech/AI events, webinars, roadshows, and conferences they sponsor or speak at — these are exactly what we want here.

You are researching events linked to "${partner.name}" (headquartered in ${partner.country || "Europe"}) that the speakers in this catalogue could attend or speak at.

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

Find events ${partner.name} HOSTS, SPONSORS, or SPEAKS AT. For each event, capture ALL THREE link types when findable: the official event page (url), the speaker/CFP application page (applyUrl), and the attendee registration/ticket page (attendUrl) — do NOT put a registration link in url; url is the main page only.
${geographyLine} Include the partner's flagship annual event wherever it is held.
Note: most partner events are attended rather than spoken at, but still record an
applyUrl whenever an open speaker track genuinely exists.

Only include events AFTER ${todayStr}.

${SCHEMA_BLOCK}`;
  } else if (broad) {
    prompt = `Today is ${todayStr}.

${scopeBlock}
${focus ? `\nPRIORITY FOCUS FOR THIS RUN: ${focus}. Weight the majority of your searches toward this theme, but still cast the wide net described below.\n` : ""}
WIDE-NET MODE: Scrape the web broadly for **ANY event and ANY podcast in or adjacent to the topics in scope**. Include the full spectrum: conferences, summits, expos, world tours, meetups, hackathons, workshops, bootcamps, webinars, and podcasts (especially shows that accept or interview guests). Include large enterprise conferences AND small community meetups AND online webinars AND podcasts — anything genuinely on or near these topics.

Do NOT apply narrow audience exclusions here. The ONLY things to skip are: (a) events with no real connection to the topics in scope at all, and (b) anything you cannot verify is real via web search. Everything else belongs in the catalogue — a small, obscure or unpromising event is still a fact, and it is not your job to decide it is not worth returning.

Use MANY web searches (8-10) casting a wide net. Work through these slices separately so results do not overlap:

${searchPlan}

Also search for flagship and vendor events in these topics that fall outside the listed places — include them when they are genuinely flagship.

Capture ALL THREE link types when findable: the official event page (url), the speaker/CFP application page (applyUrl), and the attendee registration/ticket page (attendUrl). For podcasts, put the guest-application / contact URL in applyUrl or howToApply.

Only include events AFTER ${todayStr} and up to the end of ${lastYear} (recurring podcasts/meetups with no fixed date may use startDate null). Do NOT invent anything — every event and podcast must be real and verified via web search.

${SCHEMA_BLOCK}`;
  } else {
    prompt = `Today is ${todayStr}.

${scopeBlock}
${focus ? `\nPRIORITY FOCUS FOR THIS RUN: ${focus}. Weight the majority of your searches toward this theme (events, meetups, podcasts, and webinars), while still applying the scope and exclusions below.\n` : ""}
${exclusionBlock}

Search the web for events and speaking opportunities in the topics and places in scope.

Use MULTIPLE web searches (8-10), working through these slices separately so results do not overlap and de-duplication does the rest:

${searchPlan}

${geographyLine}

Only include events AFTER ${todayStr} and up to the end of ${lastYear} — actively look ahead across the whole period, not just the next few months. For each event capture all three link types when findable: the official event page (url), the speaker/CFP application page (applyUrl), and the attendee registration/ticket page (attendUrl); also put the CFP/application URL or contact in howToApply whenever findable.

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
    const validSignals = ["DEVELOPERS", "ENGINEERS", "CUSTOMERS", "ENTREPRENEURS", "SMBS", "PROFESSIONALS", "WOMEN_IN_TECH", "PARTNERS"];
    let inserted = 0;

    for (const ev of events) {
      if (!ev.title || !ev.type || !validTypes.includes(ev.type)) continue;
      if (existingTitles.has(ev.title.toLowerCase())) continue;
      if (ev.url && existingUrls.has(ev.url.toLowerCase())) continue;
      if (ev.startDate && new Date(ev.startDate) < todayMidnight) continue;

      const signals = Array.isArray(ev.audienceSignals)
        ? ev.audienceSignals.map((s) => String(s).toUpperCase().replace(/[\s-]+/g, "_")).filter((s) => validSignals.includes(s))
        : [];

      const geo = deriveGeo({ location: ev.location, region: ev.region, title: ev.title, isOnline: ev.isOnline, type: ev.type });

      const created = await db.event.create({
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
          applyUrl: ev.applyUrl ?? null,
          attendUrl: ev.attendUrl ?? null,
          socialLinks: ev.socialLinks ? JSON.stringify(ev.socialLinks) : null,
          industry: ev.industry ?? null,
          audienceSignals: signals.length ? JSON.stringify([...new Set(signals)]) : null,
        },
      });

      /* One UNSCORED opportunity per speaker: the event lands in everyone's
         inbox, and nobody is handed a judgement made for someone else. The
         scoring pass fills these in per speaker.

         `private` is set here rather than there because it is deterministic —
         each speaker's own keywords against the event's text, no model needed
         and no reason to pay for one. */
      if (speakers.length) {
        await db.eventOpportunity.createMany({
          data: speakers.map((sp) => ({
            userId: sp.userId,
            eventId: created.id,
            status: "DISCOVERED" as const,
            private: isPrivateEvent(
              { title: ev.title, description: ev.description, industry: ev.industry, audienceDescription: ev.audienceDescription },
              sp.privateKeywords,
            ),
          })),
          skipDuplicates: true,
        });
      }

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
 * Focus theme for an automated run.
 *
 * Generated from the merged catalogue brief — every speaker's geographies and
 * topics — so the rotation eventually covers all of them rather than circling
 * one person's list forever. Rotates weekly; de-duplication at insert time
 * handles any overlap.
 */
export async function rotatingFocus(seed = Date.now()): Promise<string> {
  const rows = await db.speakerProfile.findMany();
  const catalogue = mergeProfilesForCatalogue(
    rows.map((row) => profileFromRow(row as unknown as Record<string, unknown>)),
  );
  return rotatingFocusFrom(buildFocusThemes(catalogue), seed);
}
