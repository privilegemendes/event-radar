/**
 * The per-speaker view of an event.
 *
 * These fields live on `Event` today, which means the catalogue stores one
 * speaker's opinion of each event. Phase 1 copies them onto `EventOpportunity`
 * rows that belong to a person; Phase 2 switches the reads.
 *
 * Generic over the status type so the Prisma enum survives the round trip
 * without this module importing Prisma.
 *
 * Pure, and free of Prisma and server-only imports, so it can be unit-tested —
 * and so Phase 2 can reuse the same mapping rather than writing a second one
 * that drifts.
 */

/** The subset of an Event row that is really one speaker's opinion. */
export interface EventPersonalFields<Status = string> {
  relevancyScore: number | null;
  relevancyRationale: string | null;
  acceptanceLikelihood: string | null;
  acceptanceRationale: string | null;
  suggestedAction: string | null;
  category: string | null;
  /** Renamed to employerRelevant: derived from the speaker's own employerAngle. */
  coderRelevant: boolean;
  status: Status;
  pitchDraft: string | null;
  followUpAt: Date | null;
  attending: boolean;
  readiness: string | null;
  prepStage: string | null;
  customTasks: string | null;
  /** Renamed to private: once rows belong to people, "owner-only" is just "mine". */
  ownerOnly: boolean;
}

/** The same values, named as they are on EventOpportunity. */
export interface OpportunityFields<Status = string> {
  relevancyScore: number | null;
  relevancyRationale: string | null;
  acceptanceLikelihood: string | null;
  acceptanceRationale: string | null;
  suggestedAction: string | null;
  category: string | null;
  employerRelevant: boolean;
  status: Status;
  pitchDraft: string | null;
  followUpAt: Date | null;
  attending: boolean;
  readiness: string | null;
  prepStage: string | null;
  customTasks: string | null;
  private: boolean;
}

/**
 * Project an Event row onto the opportunity fields.
 *
 * Only the two renames change; everything else is carried verbatim, including
 * nulls — a null score means "not scored yet", which is different from 0.
 */
export function opportunityFromEvent<Status>(
  e: EventPersonalFields<Status>,
): OpportunityFields<Status> {
  return {
    relevancyScore: e.relevancyScore,
    relevancyRationale: e.relevancyRationale,
    acceptanceLikelihood: e.acceptanceLikelihood,
    acceptanceRationale: e.acceptanceRationale,
    suggestedAction: e.suggestedAction,
    category: e.category,
    employerRelevant: e.coderRelevant,
    status: e.status,
    pitchDraft: e.pitchDraft,
    followUpAt: e.followUpAt,
    attending: e.attending,
    readiness: e.readiness,
    prepStage: e.prepStage,
    customTasks: e.customTasks,
    private: e.ownerOnly,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Phase 2: reading and writing one speaker's view.
 *
 * The API keeps returning a FLAT object — objective event fields and this
 * speaker's fields merged together — because that is the shape every page,
 * component and ranking helper already consumes (see EventLike in events.ts).
 * Nesting the opportunity would be tidier on the wire and would touch twenty
 * files; the separation is enforced by the schema either way.
 *
 * The wire also keeps the OLD names `coderRelevant` and `ownerOnly`, mapping to
 * `employerRelevant` and `private` in storage. Renaming the wire is a separate,
 * purely cosmetic change; doing it here would mean editing every consumer.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Fields a client may set on its own opportunity, in wire naming. */
export const OPPORTUNITY_WIRE_FIELDS = [
  "relevancyScore", "relevancyRationale", "acceptanceLikelihood", "acceptanceRationale",
  "suggestedAction", "category", "status", "pitchDraft", "followUpAt",
  "attending", "readiness", "prepStage", "customTasks",
  "coderRelevant", "ownerOnly",
] as const;

const WIRE_TO_COLUMN: Record<string, string> = {
  coderRelevant: "employerRelevant",
  ownerOnly: "private",
};

/** What a speaker sees for an event they have no opportunity row for yet. */
export function defaultOpportunity(): OpportunityFields {
  return {
    relevancyScore: null, relevancyRationale: null,
    acceptanceLikelihood: null, acceptanceRationale: null,
    suggestedAction: null, category: null,
    employerRelevant: false,
    status: "DISCOVERED",
    pitchDraft: null, followUpAt: null,
    attending: false, readiness: null, prepStage: null, customTasks: null,
    private: false,
  };
}

/**
 * Merge an event row with this speaker's opportunity into the flat shape the
 * app consumes. A missing opportunity yields defaults rather than undefined —
 * an undefined score would render as "undefined" and an undefined status would
 * break the pipeline filters.
 */
export function mergeEventWithOpportunity<E extends Record<string, unknown>>(
  event: E,
  opportunity: Partial<OpportunityFields> | null | undefined,
): Record<string, unknown> {
  const o = { ...defaultOpportunity(), ...(opportunity ?? {}) };
  const { ...rest } = event;
  delete (rest as Record<string, unknown>).opportunities;
  return {
    ...rest,
    relevancyScore: o.relevancyScore,
    relevancyRationale: o.relevancyRationale,
    acceptanceLikelihood: o.acceptanceLikelihood,
    acceptanceRationale: o.acceptanceRationale,
    suggestedAction: o.suggestedAction,
    category: o.category,
    status: o.status,
    pitchDraft: o.pitchDraft,
    followUpAt: o.followUpAt,
    attending: o.attending,
    readiness: o.readiness,
    prepStage: o.prepStage,
    customTasks: o.customTasks,
    // wire names, storage names behind them
    coderRelevant: o.employerRelevant,
    ownerOnly: o.private,
  };
}

/**
 * Split a PUT body into the columns that belong on the shared event and the
 * ones that belong on this speaker's opportunity.
 *
 * Anything not recognised as a per-speaker field falls through to the event —
 * so a new objective column keeps working without being listed here, while a
 * new per-speaker column must be added deliberately.
 */
export function splitEventUpdate(body: Record<string, unknown>): {
  eventData: Record<string, unknown>;
  opportunityData: Record<string, unknown>;
} {
  const eventData: Record<string, unknown> = {};
  const opportunityData: Record<string, unknown> = {};
  const personal = new Set<string>(OPPORTUNITY_WIRE_FIELDS);

  for (const [key, value] of Object.entries(body)) {
    if (personal.has(key)) opportunityData[WIRE_TO_COLUMN[key] ?? key] = value;
    else eventData[key] = value;
  }
  return { eventData, opportunityData };
}
