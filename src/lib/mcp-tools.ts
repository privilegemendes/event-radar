import { z } from "zod";
import { db } from "@/lib/db";
import { speakerConditions, badgeCountWhere } from "@/lib/event-filter";
import { mergeEventWithOpportunity } from "@/lib/opportunity";
import { getApplicantProfile } from "@/lib/settings";
import { scoreForSpeaker, selectUnscoredEvents, buildScoringBrief, applyScores, type ScoreSubmission } from "@/lib/scoring";
import { renderEventFacts, LIKELIHOODS, ACTIONS, CATEGORIES } from "@/lib/scoring-parse";
import { MAX_LIMIT } from "@/lib/pagination";

/**
 * The MCP tool surface, defined once and registered onto a server instance.
 *
 * These run IN PROCESS: every tool calls the same libs the HTTP routes call
 * (speakerConditions, badgeCountWhere, mergeEventWithOpportunity,
 * scoreForSpeaker), rather than looping back through the app's own API. That
 * keeps one definition of "this speaker's view of an event" instead of two
 * that can drift.
 *
 * Every tool is scoped to `userId`, taken from the verified access token — so
 * a connector acts as the person who authorised it and cannot reach anyone
 * else's rows, matching the rest of the app.
 */

const DEFAULT_LIMIT = 25;
const SCORE_DEFAULT = 25;

const EVENT_COLUMNS = {
  id: true, title: true, type: true, startDate: true, cfpDeadline: true,
  location: true, isOnline: true, region: true, url: true, isCoderEvent: true,
  partner: { select: { name: true, region: true } },
} as const;

type Row = Record<string, unknown>;

const compact = (e: Row) => {
  const d = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "string" ? v.slice(0, 10) : null);
  return {
    id: e.id, title: e.title, type: e.type, status: e.status,
    track: e.category ?? null,
    startDate: d(e.startDate), cfpDeadline: d(e.cfpDeadline),
    where: e.isOnline ? "Online" : [e.location, e.region].filter(Boolean).join(", ") || null,
    score: e.relevancyScore ?? null,
    action: e.suggestedAction ?? null,
    coderEvent: e.isCoderEvent || undefined,
    partner: (e.partner as { name?: string } | null)?.name ?? undefined,
    url: e.url ?? undefined,
  };
};

const json = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }] });

function splitName(fullName: string) {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: parts[0] ?? "", lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) as string };
}
const cityFrom = (location: string) => (location ?? "").split(",")[0].trim();

const FIELD_HINTS: Record<string, string[]> = {
  email: ["email", "e-mail", "mail"],
  firstName: ["firstname", "first_name", "given", "fname"],
  lastName: ["lastname", "last_name", "surname", "family", "lname"],
  fullName: ["fullname", "full_name", "name"],
  jobTitle: ["jobtitle", "job_title", "title", "role", "position"],
  company: ["company", "organization", "organisation", "employer"],
  city: ["city", "town", "locality"],
  phone: ["phone", "tel", "mobile"],
  linkedin: ["linkedin", "linked_in", "profile_url"],
  website: ["website", "url", "homepage"],
  headshotUrl: ["headshot", "photo", "picture", "avatar"],
  bioShort: ["bio", "biography", "about", "short_bio"],
  talkTopics: ["topics", "talk", "abstract", "session"],
  dietary: ["dietary", "accessibility", "access", "allergy"],
  pronouns: ["pronouns"],
};

/** Minimal shape of the MCP server we register onto, so this file does not
 *  depend on which SDK entry point the route chose. */
interface Registrable {
  registerTool(
    name: string,
    config: { title: string; description: string; inputSchema: Record<string, z.ZodTypeAny> },
    handler: (args: Record<string, never>) => Promise<{ content: { type: "text"; text: string }[] }>,
  ): unknown;
}

export function registerEventRadarTools(server: Registrable, userId: string) {
  server.registerTool(
    "search_events",
    {
      title: "Search events",
      description:
        "Search the Event Radar catalogue. Returns a compact row per event plus the total, " +
        "so you can page with `offset`. Scoped to you: `status`, `track` and `score` are your " +
        "own view of each event, not a shared verdict. Call get_event for full detail.",
      inputSchema: {
        search: z.string().optional().describe("Free text over title, description and location"),
        status: z.enum(["DISCOVERED", "APPROVED", "REJECTED", "PITCHED", "ACCEPTED", "SPOKEN"]).optional()
          .describe("Your pipeline status. DISCOVERED also matches events you have not judged yet."),
        track: z.enum(["ATTEND", "PARTICIPATE", "SPEAK"]).optional(),
        type: z.string().optional().describe("e.g. CONFERENCE, WEBINAR, PODCAST"),
        region: z.string().optional().describe("e.g. Europe, UK, North America"),
        coderEventsOnly: z.boolean().optional(),
        limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Default ${DEFAULT_LIMIT}`),
        offset: z.number().int().min(0).optional(),
      },
    },
    async (a: Record<string, never>) => {
      const args = a as unknown as {
        search?: string; status?: string; track?: string; type?: string;
        region?: string; coderEventsOnly?: boolean; limit?: number; offset?: number;
      };
      const take = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const skip = args.offset ?? 0;

      const where: Record<string, unknown> = {};
      if (args.type) where.type = args.type;
      if (args.region) where.region = args.region;
      if (args.coderEventsOnly) where.isCoderEvent = true;
      if (args.search) {
        where.OR = [
          { title: { contains: args.search } },
          { description: { contains: args.search } },
          { location: { contains: args.search } },
        ];
      }
      where.AND = speakerConditions(userId, { status: args.status ?? null, category: args.track ?? null });

      const opportunities = { where: { userId }, take: 1 } as const;
      const [rows, total] = await Promise.all([
        db.event.findMany({
          where, select: { ...EVENT_COLUMNS, opportunities }, take, skip,
          orderBy: [{ startDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
        }),
        db.event.count({ where }),
      ]);

      const events = rows.map((e) =>
        compact(mergeEventWithOpportunity(e as Row, (e as { opportunities?: unknown[] }).opportunities?.[0] as never) as Row),
      );

      return json({
        total,
        showing: events.length ? `${skip + 1}-${skip + events.length} of ${total}` : `0 of ${total}`,
        more: skip + events.length < total ? `call again with offset=${skip + events.length}` : null,
        events,
      });
    },
  );

  server.registerTool(
    "get_event",
    {
      title: "Get event detail",
      description: "Full detail for one event, including your own score, rationale and pipeline status.",
      inputSchema: { id: z.string().describe("Event id from search_events") },
    },
    async (a: Record<string, never>) => {
      const { id } = a as unknown as { id: string };
      const event = await db.event.findUnique({
        where: { id },
        include: { partner: true, opportunities: { where: { userId }, take: 1 } },
      });
      if (!event) return json({ error: `No event with id ${id}` });
      return json(mergeEventWithOpportunity(event as unknown as Row, event.opportunities[0] as never));
    },
  );

  server.registerTool(
    "get_pipeline_summary",
    {
      title: "Pipeline summary",
      description:
        "Orientation: how many events await your triage, how many gigs you have accepted or are " +
        "attending, and how many Coder EMEA events are on the schedule. Cheap — call first.",
      inputSchema: {},
    },
    async () => {
      const [toTriage, accepted, coderEvents] = await Promise.all([
        db.event.count({ where: badgeCountWhere(userId, "inbox") }),
        db.event.count({ where: badgeCountWhere(userId, "podium") }),
        db.event.count({ where: { isCoderEvent: true, region: { in: ["Europe", "UK"] } } }),
      ]);
      return json({
        toTriage, acceptedOrAttending: accepted, coderEmeaEvents: coderEvents,
        note: "The first two are yours; coderEmeaEvents is a property of the catalogue.",
      });
    },
  );

  server.registerTool(
    "list_partners",
    {
      title: "List partners",
      description:
        "The partner ecosystem. NOTE: partner regions are SALES TERRITORY codes (EMEA, NAMER, " +
        "LATAM), not the macro geography names events use. A partner may carry several.",
      inputSchema: { region: z.enum(["EMEA", "NAMER", "LATAM"]).optional() },
    },
    async (a: Record<string, never>) => {
      const { region } = a as unknown as { region?: string };
      const rows = await db.partner.findMany({ orderBy: { name: "asc" } });
      const filtered = region
        ? rows.filter((p) => (p.region ?? "").toUpperCase().includes(region.toUpperCase()))
        : rows;
      return json({
        total: filtered.length,
        partners: filtered.map((p) => ({ id: p.id, name: p.name, region: p.region, category: p.category })),
      });
    },
  );

  server.registerTool(
    "score_my_inbox",
    {
      title: "Score my inbox",
      description:
        "Score unscored catalogue events for you — relevancy, acceptance likelihood, suggested " +
        "action — against your stored speaker brief. Writes ONLY your own rows and never " +
        "overwrites a score already set, so it is safe to re-run. Each call costs model time.",
      inputSchema: {
        limit: z.number().int().min(1).max(200).optional().describe(`Default ${SCORE_DEFAULT}, one batch`),
      },
    },
    async (a: Record<string, never>) => {
      const { limit } = a as unknown as { limit?: number };
      const r = await scoreForSpeaker(userId, { limit: limit ?? SCORE_DEFAULT });
      if (!r.ok) {
        return json({
          error: r.status === 503
            ? "Anthropic credentials are not configured for this deployment."
            : `Scoring failed (${r.status ?? 500}).`,
          scored: r.scored, detail: r.error,
        });
      }
      return json({
        scored: r.scored, considered: r.considered,
        note: r.scored === 0 && r.considered === 0
          ? "Nothing left to score."
          : "Call again to score more of the backlog.",
      });
    },
  );


/* ── Scoring on the caller's own model ────────────────────────────────────
 * score_my_inbox spends the DEPLOYMENT's Anthropic credentials. These two do
 * the same job on the credentials of whoever is connected: the server hands
 * over the events and the rubric, the model in this conversation judges them,
 * and the verdicts come back to be validated and written.
 *
 * Worth choosing deliberately between them. This pair costs the caller context
 * and time but needs no server-side key, and judges on whatever model the
 * person is actually running. score_my_inbox is one call and survives a closed
 * conversation, which is why the weekly cron uses it.
 */
  server.registerTool(
    "get_scoring_batch",
    {
      title: "Get events to score yourself",
      description:
        "Fetch unscored events plus YOUR speaker brief and rubric, so you can judge them here " +
        "rather than spending the server's model credits. Judge each event against the brief, " +
        "then send the verdicts to save_scores. Use a modest limit — every event costs context. " +
        "Prefer score_my_inbox instead when the deployment has its own credentials and you just " +
        "want the backlog cleared.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional()
          .describe(`How many to fetch (default ${SCORE_DEFAULT}). Each one costs context.`),
      },
    },
    async (a: Record<string, never>) => {
      const { limit } = a as unknown as { limit?: number };
      const n = limit ?? SCORE_DEFAULT;
      const [events, brief] = await Promise.all([
        selectUnscoredEvents(userId, n),
        buildScoringBrief(userId),
      ]);

      return json({
        total: events.length,
        events: events.map((e, i) => ({ eventId: e.id, facts: renderEventFacts(e, i) })),
        brief,
        /* Named, because normaliseScore discards anything outside these on the
           way in — a caller should not have to guess and lose the work. */
        allowed: {
          relevancyScore: "integer 0-100",
          acceptanceLikelihood: LIKELIHOODS,
          suggestedAction: ACTIONS,
          category: CATEGORIES,
          employerRelevant: "boolean",
        },
        next: events.length
          ? "Judge each against `brief`, then call save_scores with one entry per eventId."
          : "Nothing left to score.",
      });
    },
  );

  server.registerTool(
    "save_scores",
    {
      title: "Save scores you judged",
      description:
        "Write verdicts from get_scoring_batch to YOUR rows. Every entry is validated — a value " +
        "outside the allowed set is discarded rather than stored. An event that already has a " +
        "score is left alone, never overwritten, so a score you corrected by hand survives. " +
        "Only send events you actually judged; omitting one leaves it for next time.",
      inputSchema: {
        scores: z.array(z.object({
          eventId: z.string().describe("From get_scoring_batch"),
          relevancyScore: z.number().int().min(0).max(100).optional(),
          relevancyRationale: z.string().optional().describe("1-2 sentences, for this speaker"),
          acceptanceLikelihood: z.enum(LIKELIHOODS).optional(),
          acceptanceRationale: z.string().optional(),
          suggestedAction: z.enum(ACTIONS).optional(),
          category: z.enum(CATEGORIES).optional(),
          employerRelevant: z.boolean().optional(),
        })).min(1).describe("One entry per event you judged"),
      },
    },
    async (a: Record<string, never>) => {
      const { scores } = a as unknown as { scores: ScoreSubmission[] };
      const outcome = await applyScores(userId, scores);
      return json({
        ...outcome,
        note: [
          outcome.skipped ? `${outcome.skipped} already had a score and were left alone.` : null,
          outcome.rejected ? `${outcome.rejected} had no matching event and were rejected.` : null,
        ].filter(Boolean).join(" ") || undefined,
      });
    },
  );

  server.registerTool(
    "apply_to_event",
    {
      title: "Prepare an application for an event",
      description:
        "Gather everything needed to apply or register for one event: the URL that takes an " +
        "application, your applicant details mapped to the fields forms ask for, and which are " +
        "missing. NEVER submits and never opens a browser — open `target.url` yourself, fill " +
        "from `applicant` using `fieldHints`, then STOP and let the person review and submit.",
      inputSchema: { id: z.string().describe("Event id from search_events") },
    },
    async (a: Record<string, never>) => {
      const { id } = a as unknown as { id: string };
      const [event, profile] = await Promise.all([
        db.event.findUnique({ where: { id } }),
        getApplicantProfile(userId),
      ]);
      if (!event) return json({ error: `No event with id ${id}` });

      const target = ([["applyUrl", event.applyUrl], ["attendUrl", event.attendUrl], ["url", event.url]] as const)
        .find(([, v]) => typeof v === "string" && /^https?:\/\//i.test(v));

      const { firstName, lastName } = splitName(profile.fullName);
      const applicant: Record<string, string> = {
        fullName: profile.fullName, firstName, lastName,
        email: profile.email, phone: profile.phone,
        jobTitle: profile.jobTitle, company: profile.company,
        city: cityFrom(profile.location), location: profile.location,
        pronouns: profile.pronouns, linkedin: profile.linkedin,
        twitter: profile.twitter, website: profile.website,
        headshotUrl: profile.headshotUrl, bioShort: profile.bioShort,
        bioLong: profile.bioLong, talkTopics: profile.talkTopics, dietary: profile.dietary,
      };

      return json({
        applyingAs: { name: profile.fullName || "(your profile has no name)", email: profile.email || null },
        event: {
          id: event.id, title: event.title, type: event.type,
          startDate: event.startDate, location: event.location,
          ticketCost: event.ticketCost, howToApply: event.howToApply,
        },
        target: target ? { url: target[1], source: target[0] } : null,
        applicant,
        missing: Object.entries(applicant).filter(([, v]) => !String(v ?? "").trim()).map(([k]) => k),
        fieldHints: FIELD_HINTS,
        next: target
          ? "Open target.url, match the form's inputs using fieldHints, fill from applicant, then STOP — do not submit."
          : "No application URL on this event. Read event.howToApply and ask how to proceed.",
      });
    },
  );
}
