import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { speakerConditions, upcomingOrUndated, rankThenPage, byScoreThenDate } from "@/lib/event-filter";
import { mergeEventWithOpportunity, OPPORTUNITY_WIRE_FIELDS } from "@/lib/opportunity";
import type { Page } from "@/lib/pagination";

/**
 * Listing events for one speaker — the whole operation, in one place.
 *
 * This exists because sharing PRIMITIVES was not enough. The HTTP route and the
 * MCP tool both imported speakerConditions and still drifted: each composed it
 * independently, so when the inbox gained a date window and score ranking, only
 * the route got them. The tool went on serving 107 events that had already
 * happened, in date order, to a caller asking for the highest-scoring.
 *
 * So the unit shared here is the operation, not its parts. A caller supplies
 * filters and a page and receives rows; it does not get to reassemble the view
 * semantics itself, which is what makes a second, subtly different inbox
 * impossible rather than merely discouraged.
 */
/**
 * Named data contracts for the list endpoint. This route returns every matching
 * event, so columns a consumer never renders are pure transfer cost — at ~1250
 * events the full payload is ~1.9 MB, while the map needs four columns of it.
 *
 * Each set is traced from what the page AND the components it hands events to
 * actually read at runtime, not from the page's local interface: those are
 * incomplete and type the extras as optional, so TypeScript will not catch a
 * missing field. `isCoderEvent` and `url` in particular are undeclared on the
 * podium and inbox interfaces but read by EventAvatar.
 *
 * An unknown or absent `view` falls through to the full payload.
 */
const VIEWS: Record<string, Prisma.EventSelect> = {
  // Aggregated into location bubbles; no event object reaches a component.
  map: { region: true, location: true, isOnline: true, status: true },

  calendar: {
    id: true, title: true, type: true, status: true, startDate: true, endDate: true,
    partnerId: true, isCoderEvent: true,
    partner: { select: { name: true, category: true } },
  },

  // readiness/prepStage/customTasks feed ReadinessCard; isCoderEvent feeds its EventAvatar.
  podium: {
    id: true, title: true, type: true, url: true, startDate: true, endDate: true,
    location: true, isOnline: true, status: true, attending: true,
    readiness: true, prepStage: true, customTasks: true, isCoderEvent: true,
  },

  inbox: {
    id: true, title: true, type: true, cfpDeadline: true, startDate: true,
    location: true, isOnline: true, region: true, coderRelevant: true,
    sourceNote: true, industry: true, relevancyScore: true, relevancyRationale: true,
    suggestedAction: true, url: true, isCoderEvent: true,
    partner: { select: { name: true, region: true } },
  },
};
export interface EventListFilters {
  status?: string | null;
  type?: string | null;
  region?: string | null;
  search?: string | null;
  category?: string | null;
  /** The wire name; the column is `employerRelevant`. */
  coderRelevant?: string | null;
  isCoderEvent?: string | null;
  /** Drives BOTH the projection and the view's semantics — they travel
   *  together on purpose, so a caller cannot take one without the other. */
  view?: string | null;
  /** Ranked views exclude events that have already happened, because a triage
   *  queue cannot act on them. Set to keep them for a historical lookup. */
  includePast?: boolean;
}

export interface EventListResult {
  events: Record<string, unknown>[];
  /** Rows matching the filters, before the page was taken. */
  total: number;
}

/** Views ranked by THIS speaker's score, which lives on the opportunity and so
 *  cannot be an ORDER BY. They are fetched whole, ranked, then sliced. */
const RANKED_VIEWS = new Set(["inbox"]);

/** Views that are triage queues: an event already past cannot be acted on. */
const UPCOMING_ONLY_VIEWS = new Set(["inbox", "podium"]);

/**
 * Every event matching `filters` for this speaker, merged with their own
 * opportunity row, ranked and paged.
 *
 * `total` is always the count BEFORE paging, so a caller can page without a
 * second query and without guessing.
 */
export async function listEventsForSpeaker(
  userId: string,
  filters: EventListFilters = {},
  page: Page = { paginated: false },
): Promise<EventListResult> {
  const { status, type, region, search, category, coderRelevant, isCoderEvent, view } = filters;

  const where: Record<string, unknown> = {};

  /* Objective facts about the event itself stay on Event. */
  if (type) where.type = type;
  if (isCoderEvent === "true") where.isCoderEvent = true;
  if (isCoderEvent === "false") where.isCoderEvent = false;
  if (region) where.region = region;
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { description: { contains: search } },
      { location: { contains: search } },
    ];
  }

  /* Everything per-speaker — status, category, employer relevance, privacy,
     the podium's accepted/attending test — is filtered through THIS speaker's
     opportunity row. */
  const and: unknown[] = speakerConditions(userId, { status, category, coderRelevant, view });

  if (view && UPCOMING_ONLY_VIEWS.has(view) && !filters.includePast) {
    and.push(upcomingOrUndated());
  }
  where.AND = and;

  const orderBy: Prisma.EventOrderByWithRelationInput[] = [
    { startDate: { sort: "asc", nulls: "last" } },
    { cfpDeadline: { sort: "asc", nulls: "last" } },
    { createdAt: "desc" },
  ];

  /* Only THIS speaker's row is fetched, so another speaker's opinion never
     reaches the query and cannot leak through the flattening below. */
  const opportunities = { where: { userId }, take: 1 } as const;

  /* The projection views still name per-speaker columns, which live on the
     opportunity. Strip them from the event select and let the merge supply
     them — otherwise a view would serve whatever stale value is still sitting
     on the Event row. */
  const personal = new Set<string>(OPPORTUNITY_WIRE_FIELDS);
  const viewSelect = view && VIEWS[view]
    ? Object.fromEntries(Object.entries(VIEWS[view]).filter(([k]) => !personal.has(k)))
    : undefined;

  /* A ranked view cannot be paged in SQL: slicing first would hand the ranking
     the EARLIEST rows and return "the best of the first 25" rather than "the
     best 25". Those views are fetched whole and paged in memory below. */
  const ranksInMemory = !!view && RANKED_VIEWS.has(view);
  const sqlPage: { take?: number; skip?: number } =
    ranksInMemory ? {} : { take: page.take, skip: page.skip };

  // Prisma rejects `select` and `omit` in the same query, so the two shapes are
  // separate calls. Both share `where`, `orderBy` and the page bounds.
  const rows = viewSelect
    ? await db.event.findMany({
        where, select: { ...viewSelect, id: true, opportunities }, orderBy, ...sqlPage,
      })
    : await db.event.findMany({
        where,
        ...sqlPage,
        // Trim fields no list view renders — pure transfer cost here. The
        // detail route still returns the full row.
        omit: {
          ownerOnly:           true,
          followUpAt:          true,
          acceptanceRationale: true,
          attendUrl:           true,
          socialLinks:         true,
          createdAt:           true,
          updatedAt:           true,
        },
        include: { partner: { select: { id: true, name: true, region: true, category: true } }, opportunities },
        orderBy,
      });

  const merged = rows.map((e) => mergeEventWithOpportunity(
    e as Record<string, unknown>,
    (e as { opportunities?: unknown[] }).opportunities?.[0] as never,
  )) as Record<string, unknown>[];

  if (ranksInMemory) {
    const total = merged.length;
    if (!page.paginated) {
      merged.sort(byScoreThenDate as (a: unknown, b: unknown) => number);
      return { events: merged, total };
    }
    return {
      events: rankThenPage(merged as never[], page.skip ?? 0, page.take ?? total) as Record<string, unknown>[],
      total,
    };
  }

  /* Unranked views were paged by the database, so the total needs its own
     count — but only when the caller paged; an unpaginated read already holds
     every row and a COUNT would be pure added latency. */
  return {
    events: merged,
    total: page.paginated ? await db.event.count({ where }) : merged.length,
  };
}
