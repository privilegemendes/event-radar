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
