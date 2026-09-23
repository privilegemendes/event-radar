#!/usr/bin/env node
/**
 * Event Radar MCP server — read tools.
 *
 * Runs as a local stdio subprocess of the MCP client (Claude Desktop, Claude
 * Code) and talks to Event Radar over its normal HTTP API as a signed-in user.
 *
 * Why stdio and not an in-app /api/mcp route: a remote HTTP MCP server needs a
 * way for the CLIENT to authenticate, and better-auth 1.7.5 ships no `mcp`
 * OAuth plugin (verified against the installed package — it has bearer, jwt,
 * organization and others, but no mcp and no apiKey). A local subprocess sides
 * step that: it holds the service-account credential in its own env and the
 * app needs no modification at all.
 *
 * TOOL DESIGN — the one rule that matters here:
 *
 *   GET /api/events returns EVERY matching row. Unpaginated that is ~1,300
 *   events and roughly half a million tokens: one unguarded call would blow any
 *   context window. So every tool below sends an explicit `limit` and reports
 *   the total, rather than inheriting the API's "all rows" default. The API is
 *   opt-in paginated for the app's sake; the MCP surface is opt-out.
 *
 * Config (Claude Desktop / Claude Code):
 *   command: node, args: ["<repo>/mcp/server.mjs"]
 *   env: EVENT_RADAR_URL, MCP_SERVICE_EMAIL, MCP_SERVICE_PASSWORD
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { EventRadarClient } from "./client.mjs";

const DEFAULT_LIMIT = 25;
/** One LLM batch (scoring.ts BATCH = 25). Keeps a single tool call quick. */
const SCORE_DEFAULT = 25;
const client = new EventRadarClient();

/** Compact an event down to what a model actually reasons over. The inbox view
 *  is already the narrowest server-side projection; this trims it further —
 *  rationale prose and source notes are fetched on demand via get_event. */
const compact = (e) => ({
  id: e.id,
  title: e.title,
  type: e.type,
  status: e.status,
  track: e.category ?? null,
  startDate: e.startDate?.slice(0, 10) ?? null,
  cfpDeadline: e.cfpDeadline?.slice(0, 10) ?? null,
  where: e.isOnline ? "Online" : [e.location, e.region].filter(Boolean).join(", ") || null,
  score: e.relevancyScore ?? null,
  action: e.suggestedAction ?? null,
  coderEvent: e.isCoderEvent || undefined,
  partner: e.partner?.name ?? undefined,
  url: e.url ?? undefined,
});

const json = (v) => ({ content: [{ type: "text", text: JSON.stringify(v, null, 2) }] });
const fail = (e) => ({ isError: true, content: [{ type: "text", text: `Event Radar: ${e.message}` }] });

const server = new McpServer({ name: "event-radar", version: "0.1.0" });

server.registerTool(
  "search_events",
  {
    title: "Search events",
    description:
      "Search the Event Radar catalogue. Returns a compact row per event plus the total " +
      "number of matches, so you can page with `offset`. Results are scoped to the " +
      "signed-in speaker: `status`, `track` and `score` are THIS speaker's own view of " +
      "each event, not a shared verdict. Call get_event for full detail on one row.",
    inputSchema: {
      search: z.string().optional().describe("Free text over title, description and location"),
      status: z.enum(["DISCOVERED", "APPROVED", "REJECTED", "PITCHED", "ACCEPTED", "SPOKEN"]).optional()
        .describe("This speaker's pipeline status. DISCOVERED also matches events they have not judged yet."),
      track: z.enum(["ATTEND", "PARTICIPATE", "SPEAK"]).optional().describe("Opportunity track"),
      type: z.string().optional().describe("Event type, e.g. CONFERENCE, WEBINAR, PODCAST"),
      region: z.string().optional().describe("Macro region, e.g. Europe, UK, North America"),
      coderEventsOnly: z.boolean().optional().describe("Only events on Coder's official schedule"),
      limit: z.number().int().min(1).max(200).optional().describe(`Rows to return (default ${DEFAULT_LIMIT}, max 200)`),
      offset: z.number().int().min(0).optional().describe("Rows to skip, for paging"),
    },
  },
  async (a) => {
    try {
      const q = new URLSearchParams({ view: "inbox", limit: String(a.limit ?? DEFAULT_LIMIT) });
      if (a.offset) q.set("offset", String(a.offset));
      if (a.search) q.set("search", a.search);
      if (a.status) q.set("status", a.status);
      if (a.track) q.set("category", a.track);
      if (a.type) q.set("type", a.type);
      if (a.region) q.set("region", a.region);
      if (a.coderEventsOnly) q.set("isCoderEvent", "true");

      const { data, headers } = await client.json(`/api/events?${q}`);
      const total = Number(headers.get("x-total-count") ?? data.length);
      const shown = data.length;
      const from = a.offset ?? 0;

      return json({
        total,
        showing: shown ? `${from + 1}-${from + shown} of ${total}` : `0 of ${total}`,
        more: from + shown < total ? `call again with offset=${from + shown}` : null,
        events: data.map(compact),
      });
    } catch (e) { return fail(e); }
  },
);

server.registerTool(
  "get_event",
  {
    title: "Get event detail",
    description:
      "Full detail for one event: description, how to apply, CFP and registration links, " +
      "audience, cost, and this speaker's own score, rationale and pipeline status.",
    inputSchema: { id: z.string().describe("Event id from search_events") },
  },
  async ({ id }) => {
    try {
      const { data } = await client.json(`/api/events/${encodeURIComponent(id)}`);
      return json(data);
    } catch (e) { return fail(e); }
  },
);

server.registerTool(
  "get_pipeline_summary",
  {
    title: "Pipeline summary",
    description:
      "Orientation: how many events await triage, how many gigs are accepted or being " +
      "attended, and how many Coder EMEA events are on the schedule. Cheap — call this " +
      "first to size the work before searching.",
    inputSchema: {},
  },
  async () => {
    try {
      const { data } = await client.json("/api/events/counts");
      return json({
        toTriage: data.inbox,
        acceptedOrAttending: data.gigs,
        coderEmeaEvents: data.coderEvents,
        note: "toTriage and acceptedOrAttending are this speaker's own; coderEmeaEvents is a property of the catalogue.",
      });
    } catch (e) { return fail(e); }
  },
);

server.registerTool(
  "list_partners",
  {
    title: "List partners",
    description:
      "The partner ecosystem — name, region, category and stage. NOTE: partner regions are " +
      "SALES TERRITORY codes (EMEA, NAMER, LATAM), not the macro geography names events use " +
      "(Europe, UK, North America). A partner may carry several, e.g. \"NAMER,EMEA\".",
    inputSchema: {
      region: z.enum(["EMEA", "NAMER", "LATAM"]).optional()
        .describe("Sales territory. Matches partners carrying it among several."),
    },
  },
  async ({ region }) => {
    try {
      const { data } = await client.json("/api/partners");
      /* Substring, not equality: the column is a comma-joined list for partners
         covering more than one territory ("NAMER,EMEA"), which equality misses. */
      const rows = region
        ? data.filter((p) => (p.region ?? "").toUpperCase().includes(region.toUpperCase()))
        : data;
      return json({
        total: rows.length,
        partners: rows.map((p) => ({ id: p.id, name: p.name, region: p.region, category: p.category, stage: p.stage })),
      });
    } catch (e) { return fail(e); }
  },
);

server.registerTool(
  "list_speakers",
  {
    title: "List speakers",
    description: "Speakers tracked as potential contacts or co-panellists, with title and organisation.",
    inputSchema: { limit: z.number().int().min(1).max(200).optional().describe(`Default ${DEFAULT_LIMIT}`) },
  },
  async ({ limit }) => {
    try {
      const { data } = await client.json("/api/speakers");
      const rows = data.slice(0, limit ?? DEFAULT_LIMIT);
      return json({
        total: data.length,
        showing: rows.length,
        speakers: rows.map((s) => ({ id: s.id, name: s.name, title: s.title, org: s.org ?? s.company ?? null })),
      });
    } catch (e) { return fail(e); }
  },
);

/* ── Write tools ──────────────────────────────────────────────────────────
 * score_my_inbox is the safest write this app has, which is why it is the
 * first one exposed:
 *   • self-scoped — POST /api/events/score takes NO userId and only ever
 *     writes the caller's own opportunity rows;
 *   • idempotent — scoreForSpeaker() selects only rows with no score yet, so
 *     a re-run never overwrites a score the speaker corrected by hand;
 *   • bounded — it scores upcoming and undated events only, never spending a
 *     model call on a conference that already happened.
 * It also needs no ADMIN: a MEMBER who cannot run it never gets scores at all.
 */
server.registerTool(
  "score_my_inbox",
  {
    title: "Score my inbox",
    description:
      "Have the model score unscored catalogue events for the signed-in speaker — " +
      "relevancy 0-100, acceptance likelihood, and a suggested action — against their " +
      "stored speaker brief. Writes ONLY this speaker's own rows and never overwrites a " +
      "score already set, so it is safe to re-run to work through a backlog. Each call " +
      "costs model time: events are scored in batches of 25, so keep `limit` modest and " +
      "call again rather than asking for hundreds at once.",
    inputSchema: {
      limit: z.number().int().min(1).max(200).optional()
        .describe(`How many unscored events to score this call (default ${SCORE_DEFAULT}, one batch). Higher is slower.`),
    },
  },
  async ({ limit }) => {
    try {
      const n = limit ?? SCORE_DEFAULT;
      const res = await client.api("/api/events/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: n }),
      });
      const data = await res.json();

      if (!res.ok) {
        /* The route distinguishes these, and the difference is actionable:
           503 is a missing ANTHROPIC_* config (an operator fix), 502 is the
           model call itself failing (worth retrying). Neither is a bug in the
           catalogue, so say which it is rather than "scoring failed". */
        const why = res.status === 503
          ? "Anthropic credentials are not configured for this deployment (ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN)."
          : `The scoring request failed (HTTP ${res.status}).`;
        return { isError: true, content: [{ type: "text", text:
          `${why} ${data.scored ? `${data.scored} event(s) were scored before it stopped.` : "Nothing was scored."} ` +
          `Detail: ${data.error ?? "none"}` }] };
      }

      return json({
        scored: data.scored,
        considered: data.considered,
        note: data.scored === 0 && data.considered === 0
          ? "Nothing left to score — every upcoming event already has a score for this speaker."
          : data.scored < data.considered
            ? `${data.considered - data.scored} of the ${data.considered} considered did not come back with a usable score; re-running will retry them.`
            : "Call again to score more of the backlog.",
      });
    } catch (e) { return fail(e); }
  },
);

/* ── Apply helper ─────────────────────────────────────────────────────────
 * This tool does NOT submit anything, and it does not drive a browser — an
 * MCP server is a stdio subprocess with no browser of its own, and the
 * client's browser is the one a human can watch and take over, which is the
 * whole point on an action that ends in a real submission.
 *
 * What it does is collapse the four steps before that into one call: resolve
 * which URL actually takes an application, fetch the applicant profile, derive
 * the fields application forms ask for but the profile does not store
 * (first/last name, city), and say plainly which fields are missing.
 *
 * IDENTITY: /api/settings/profile returns the CALLER'S OWN row — "a speaker's
 * profile is their own, not the owner's". There is deliberately no way to
 * apply on someone else's behalf, matching /api/events/score, which takes no
 * userId for the same reason. So this applies as whoever the server signed in
 * as, and it says who that is in every reply, so a demo cannot silently apply
 * with the wrong person's details.
 */

/** Application forms almost always want these separately; the profile stores
 *  one `fullName`. Last token is the surname, the rest the given name(s) —
 *  wrong for some naming conventions, so both the split AND the original are
 *  returned and the caller can prefer fullName where a form takes one field. */
function splitName(fullName) {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: parts[0] ?? "", lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) };
}

/** "Amsterdam, NL" → "Amsterdam". Forms ask for a city; the profile stores a
 *  free-text location that usually carries a country too. */
function cityFrom(location) {
  return (location ?? "").split(",")[0].trim();
}

/** Common name/id/label fragments per profile field, so the caller can match a
 *  form's inputs without a round-trip of guesses. */
const FIELD_HINTS = {
  email:      ["email", "e-mail", "mail"],
  firstName:  ["firstname", "first_name", "given", "fname"],
  lastName:   ["lastname", "last_name", "surname", "family", "lname"],
  fullName:   ["fullname", "full_name", "name"],
  jobTitle:   ["jobtitle", "job_title", "title", "role", "position"],
  company:    ["company", "organization", "organisation", "employer"],
  city:       ["city", "town", "locality"],
  location:   ["location", "country", "region"],
  phone:      ["phone", "tel", "mobile"],
  linkedin:   ["linkedin", "linked_in", "profile_url"],
  twitter:    ["twitter", "x_handle"],
  website:    ["website", "url", "homepage", "blog"],
  headshotUrl:["headshot", "photo", "picture", "avatar"],
  bioShort:   ["bio", "biography", "about", "short_bio"],
  bioLong:    ["long_bio", "detailed_bio"],
  talkTopics: ["topics", "talk", "abstract", "session"],
  dietary:    ["dietary", "accessibility", "access", "allergy"],
  pronouns:   ["pronouns"],
};

server.registerTool(
  "apply_to_event",
  {
    title: "Prepare an application for an event",
    description:
      "Gather everything needed to apply or register for one event: the URL that actually " +
      "takes an application, the signed-in speaker's applicant details mapped to the fields " +
      "forms ask for, and which details are missing. Applies AS THE SIGNED-IN SPEAKER — " +
      "there is no way to apply on someone else's behalf. " +
      "This tool NEVER submits and never opens a browser: open `target.url` yourself, fill " +
      "from `applicant` using `fieldHints` to match inputs, then STOP and let the person " +
      "review and press submit. Check `missing` first — a form may require something the " +
      "profile does not have.",
    inputSchema: { id: z.string().describe("Event id from search_events") },
  },
  async ({ id }) => {
    try {
      const [{ data: event }, { data: profile }] = await Promise.all([
        client.json(`/api/events/${encodeURIComponent(id)}`),
        client.json("/api/settings/profile"),
      ]);

      /* An application URL beats a ticket URL beats the event's homepage. The
         first two are often absent — howToApply is then the only instruction
         there is, so it is always returned rather than only as a fallback. */
      const target = [
        ["applyUrl", event.applyUrl],
        ["attendUrl", event.attendUrl],
        ["url", event.url],
      ].find(([, v]) => typeof v === "string" && /^https?:\/\//i.test(v));

      const { firstName, lastName } = splitName(profile.fullName);
      const applicant = {
        fullName: profile.fullName, firstName, lastName,
        email: profile.email, phone: profile.phone,
        jobTitle: profile.jobTitle, company: profile.company,
        city: cityFrom(profile.location), location: profile.location,
        pronouns: profile.pronouns, linkedin: profile.linkedin,
        twitter: profile.twitter, website: profile.website,
        headshotUrl: profile.headshotUrl,
        bioShort: profile.bioShort, bioLong: profile.bioLong,
        talkTopics: profile.talkTopics, dietary: profile.dietary,
      };

      const missing = Object.entries(applicant)
        .filter(([, v]) => !String(v ?? "").trim())
        .map(([k]) => k);

      return json({
        applyingAs: { name: profile.fullName || "(profile has no name)", email: profile.email || null },
        event: {
          id: event.id, title: event.title, type: event.type,
          startDate: event.startDate, location: event.location,
          isOnline: event.isOnline, ticketCost: event.ticketCost ?? null,
          howToApply: event.howToApply ?? null,
        },
        target: target ? { url: target[1], source: target[0] } : null,
        applicant,
        missing,
        fieldHints: FIELD_HINTS,
        next: target
          ? "Open target.url, match the form's inputs using fieldHints, fill from applicant, then STOP — do not submit. Let the person review and send it themselves."
          : "No application URL on this event. Read event.howToApply and ask the person how they want to proceed.",
      });
    } catch (e) { return fail(e); }
  },
);

await server.connect(new StdioServerTransport());
