import { db } from "@/lib/db";
import { deriveGeo } from "@/lib/events";
import { getApplicantProfile } from "@/lib/settings";
import {
  buildSpeakerProfile,
  buildScoringRubric,
  buildExclusions,
  buildGeographyLine,
  buildSearchPlan,
  buildFocusThemes,
  rotatingFocusFrom,
  parseList,
  isPrivateEvent,
} from "@/lib/speaker-brief";

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
  "coderRelevant": true if the event is relevant to the speaker's employer's domain as described in the profile above (false when there is no employer angle),
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
  "category": "ATTEND" | "PARTICIPATE" | "SPEAK",   // top-level track. SPEAK = a realistic personal speaking slot (suggestedAction APPLY_TO_SPEAK/BOTH). PARTICIPATE = attended in the employer role, or the employer would sponsor or exhibit, or the audience is that employer's customers and partners. Use PARTICIPATE only when the profile describes an employer angle. ATTEND = attended individually for personal learning or network, with no employer or speaking angle.
  "audienceSignals": ["DEVELOPERS" | "ENGINEERS" | "CUSTOMERS" | "ENTREPRENEURS" | "SMBS" | "PROFESSIONALS" | "WOMEN_IN_TECH" | "PARTNERS"],   // who attends; include every tag that clearly applies. WOMEN_IN_TECH for Women-in-Tech/AI communities. CUSTOMERS/PARTNERS when the employer's prospective customers or channel partners gather there.
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
  const searchYear = today.getFullYear();

  /* Every person-specific block in the prompts below is rendered from the
     stored profile rather than hardcoded. A blank profile still yields a
     coherent prompt — see buildSpeakerProfile's empty-profile test. */
  const profile = await getApplicantProfile();
  const speakerBlock   = buildSpeakerProfile(profile, "full");
  const rubricBlock    = buildScoringRubric(profile);
  const exclusionBlock = buildExclusions(profile);
  const geographyLine  = buildGeographyLine(profile);
  const searchPlan     = buildSearchPlan(profile, searchYear);
  const privateKeywords = parseList(profile.privateKeywords);
  const lastYear = searchYear + 2;

  let prompt: string;

  if (partner) {
    prompt = `Today is ${todayStr}.

${speakerBlock}

${rubricBlock}

EXCLUSIONS for partner mode: skip pure legal/compliance/tax webinars and narrow non-tech trade shows with no networking value for a developer-tools partnership. INCLUDE the partner's own summits, customer events, user conferences, tech/AI events, webinars, roadshows, and conferences they sponsor or speak at — these are exactly what we want here.

You are researching events linked to "${partner.name}" (headquartered in ${partner.country || "Europe"}) that this speaker could attend or speak at in their employer role.

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
${geographyLine} Include the partner's flagship annual event wherever it is held.

Only include events AFTER ${todayStr}.

${SCHEMA_BLOCK}`;
  } else if (broad) {
    prompt = `Today is ${todayStr}.

${speakerBlock}

${rubricBlock}
${focus ? `\nPRIORITY FOCUS FOR THIS RUN: ${focus}. Weight the majority of your searches toward this theme, but still cast the wide net described below.\n` : ""}
WIDE-NET MODE: Scrape the web broadly for **ANY event and ANY podcast in or adjacent to this speaker's topics** — do NOT limit to the audiences the rubric scores highest. Include the full spectrum: conferences, summits, expos, world tours, meetups, hackathons, workshops, bootcamps, webinars, and podcasts (especially shows that accept or interview guests). Include large enterprise conferences AND small community meetups AND online webinars AND podcasts — anything genuinely on or near these topics.

Do NOT apply narrow audience exclusions here. The ONLY things to skip are: (a) events with no real connection to the speaker's topics at all, and (b) anything you cannot verify is real via web search. Everything else is in-scope; just score it honestly with the rubric — events that score low and come back as ATTEND are still worth returning.

Use MANY web searches (8-10) casting a wide net. Work through these slices separately so results do not overlap:

${searchPlan}

Also search for flagship and vendor events in these topics that fall outside the listed geographies — include them when they are genuinely flagship.

Capture ALL THREE link types when findable: the official event page (url), the speaker/CFP application page (applyUrl), and the attendee registration/ticket page (attendUrl). For podcasts, put the guest-application / contact URL in applyUrl or howToApply.

Only include events AFTER ${todayStr} and up to the end of ${lastYear} (recurring podcasts/meetups with no fixed date may use startDate null). Do NOT invent anything — every event and podcast must be real and verified via web search.

${SCHEMA_BLOCK}`;
  } else {
    prompt = `Today is ${todayStr}.

${speakerBlock}

${rubricBlock}
${focus ? `\nPRIORITY FOCUS FOR THIS RUN: ${focus}. Weight the majority of your searches toward this theme (events, meetups, podcasts, and webinars), while still applying the speaker profile, scoring rubric, and exclusions below.\n` : ""}
${exclusionBlock}

Search the web for speaking opportunities for this speaker, prioritising events whose audience matches the rubric's highest-scoring bands.

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

    /* Every speaker with a profile gets their own opportunity row for a newly
       discovered event, so it appears in each of their inboxes. The scores
       below are computed against the brief that ran THIS pass — see the note
       at the insert. */
    const speakers = await db.speakerProfile.findMany({ select: { userId: true } });

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
          coderRelevant,
          ownerOnly: isPrivateEvent({ title: ev.title, description: ev.description, industry: ev.industry, audienceDescription: ev.audienceDescription }, privateKeywords),
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

      /* One opportunity per speaker profile.

         NOTE: every speaker receives the SAME score, track and likelihood —
         the ones this discovery pass computed, against whichever brief it ran
         with. That is wrong for anyone else and is Phase 4's job to fix, by
         splitting discovery into a shared catalogue pass and a cheap
         per-speaker scoring pass. Until then the values are a starting point,
         and each speaker can change their own without affecting anyone else. */
      if (speakers.length) {
        await db.eventOpportunity.createMany({
          data: speakers.map((sp) => ({
            userId: sp.userId,
            eventId: created.id,
            status: "DISCOVERED" as const,
            relevancyScore: score,
            relevancyRationale: ev.relevancyRationale ?? null,
            acceptanceLikelihood: likelihood,
            acceptanceRationale: ev.acceptanceRationale ?? null,
            suggestedAction: action,
            category,
            employerRelevant: coderRelevant,
            private: isPrivateEvent(
              { title: ev.title, description: ev.description, industry: ev.industry, audienceDescription: ev.audienceDescription },
              privateKeywords,
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
 * Generated from the stored profile so each pass explores a different slice of
 * that speaker's own geographies and topics instead of a fixed list, and
 * rotates weekly. De-duplication at insert time handles any overlap.
 */
export async function rotatingFocus(seed = Date.now()): Promise<string> {
  const profile = await getApplicantProfile();
  return rotatingFocusFrom(buildFocusThemes(profile), seed);
}
