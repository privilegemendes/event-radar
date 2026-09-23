/**
 * Per-speaker `where` conditions for the events list.
 *
 * Phase 2 moved the per-speaker values — status, category, attending,
 * employerRelevant, private — off `Event` and onto `EventOpportunity`, but the
 * list endpoint kept filtering on the old `Event` columns. That worked only
 * while the two agreed, which they stopped doing the moment anyone approved an
 * event: `splitEventUpdate` routes `status` to the opportunity and never back
 * to the event, so `Event.status` froze at whatever discovery wrote. An
 * approved event stayed in the inbox on reload, and an accepted gig never
 * reached the podium.
 *
 * Phase 4 made the same gap wider: discovery stopped writing `Event.category`
 * and `Event.coderRelevant` at all, so those columns are null/false on every
 * newly catalogued event.
 *
 * Everything here is a pure function of the parameters, free of Prisma and of
 * `server-only`, so the composition is unit-tested without a database.
 */

/** A speaker with no opportunity row for an event reads as these defaults —
 *  the same ones `defaultOpportunity()` supplies to the response. A filter has
 *  to honour them, or an event nobody has judged yet would vanish from a list
 *  it plainly belongs in. */
export const NO_ROW_STATUS = "DISCOVERED";

type Condition = Record<string, unknown>;

/**
 * Match THIS speaker's opportunity.
 *
 * `matchesDefault` says whether an event with no row for this speaker should
 * also match — i.e. whether the value being filtered for is what
 * `defaultOpportunity()` would have returned.
 */
export function mine(userId: string, match: Condition, matchesDefault: boolean): Condition {
  const some: Condition = { opportunities: { some: { userId, ...match } } };
  if (!matchesDefault) return some;
  return { OR: [some, { opportunities: { none: { userId } } }] };
}

/**
 * Hide events another speaker has marked private.
 *
 * Generalises the old `Event.ownerOnly` rule, which hid the owner's private
 * events from everyone else. `NOT: { userId }` is what keeps a speaker's own
 * private events visible to them — it excludes their own row from the test, so
 * only *someone else's* private marking hides an event.
 */
export function notPrivateToOthers(userId: string): Condition {
  return { opportunities: { none: { private: true, NOT: { userId } } } };
}

export interface EventFilterParams {
  status?: string | null;
  category?: string | null;
  /** The wire name is `coderRelevant`; the column is `employerRelevant`. */
  coderRelevant?: string | null;
  view?: string | null;
}

/**
 * Every per-speaker condition for one request, as an array to be AND-ed.
 *
 * Returned as an array rather than merged into the caller's object because
 * several of these are themselves `OR`s: writing them onto `where.OR` would
 * clobber the search term's `OR`, and silently widen the query instead of
 * narrowing it.
 */
export function speakerConditions(userId: string, params: EventFilterParams): Condition[] {
  const out: Condition[] = [notPrivateToOthers(userId)];

  if (params.status) {
    out.push(mine(userId, { status: params.status }, params.status === NO_ROW_STATUS));
  }

  if (params.category) {
    // No concrete category matches the default (null), so a speaker with no
    // row is correctly excluded from a category-filtered list.
    out.push(mine(userId, { category: params.category }, false));
  }

  if (params.coderRelevant === "true") {
    out.push(mine(userId, { employerRelevant: true }, false));
  } else if (params.coderRelevant === "false") {
    out.push(mine(userId, { employerRelevant: false }, true));
  }

  if (params.view === "podium") {
    // Accepted or attended gigs. Both halves are this speaker's own — another
    // speaker's acceptance must not pull an event onto my podium.
    out.push(mine(userId, { OR: [{ status: { in: PODIUM_STATUSES } }, { attending: true }] }, false));
  }

  return out;
}

/**
 * Statuses that put an event on the podium.
 *
 * Named because two call sites need the same set, and the sidebar badge and the
 * podium page had already drifted apart on it — the badge counted ACCEPTED
 * only, so a SPOKEN gig would have shown on the page and not in the count.
 */
export const PODIUM_STATUSES = ["ACCEPTED", "SPOKEN"] as const;

/**
 * The podium's date window: not yet happened, or no date at all.
 *
 * A fact about the event rather than about anyone's opinion of it, so it is a
 * plain Event condition rather than something routed through an opportunity.
 *
 * This is the half the sidebar badge was missing. The podium means "gigs still
 * ahead of me"; without the window a gig that happened last week keeps its
 * badge forever, and the page it links to is empty.
 */
export function upcomingOrUndated(now: Date = new Date()): Condition {
  /* Floored to the start of the day, not the current instant. `startDate` is a
     date, stored at 00:00, so comparing against "now" makes every event
     happening TODAY read as past — they were scored (scoring floors to
     midnight) and then hidden from the list, which is how 100 scored events
     showed up as 92. An event today has not finished. */
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  return { OR: [{ startDate: null }, { startDate: { gte: from } }] };
}

/**
 * The complete `where` for one of the sidebar's badge counts.
 *
 * The badges exist to tell a speaker how many rows the page behind them holds.
 * They were built from their own hand-written predicates, and every difference
 * between those and the page's showed up as a badge that lied:
 *
 *   - podium: no date window, so a gig three days past still counted
 *   - inbox:  counted only existing opportunity rows, so a speaker who has
 *             never been scored saw a full inbox behind a badge of 0, and
 *             later, no date window once the page dropped past events
 *   - both:   an older privacy rule that hid a speaker's own private events
 *             from their own badge while the page showed them
 *
 * Sharing speakerConditions is what stops that recurring: one predicate, used
 * by the list and the count, so they cannot disagree.
 */
export function badgeCountWhere(
  userId: string,
  badge: "inbox" | "podium",
  now: Date = new Date(),
): Condition {
  /* Both badges carry the date window, because both pages do. The inbox gained
     it when past events were dropped from triage; leaving the count behind
     would put 103 dead rows back in the number above a list that no longer
     shows them — the same drift this function exists to prevent. */
  if (badge === "inbox") {
    return { AND: [...speakerConditions(userId, { status: NO_ROW_STATUS }), upcomingOrUndated(now)] };
  }
  return { AND: [...speakerConditions(userId, { view: "podium" }), upcomingOrUndated(now)] };
}

/* ── Inbox ordering ───────────────────────────────────────────────────────
 * The inbox is a triage queue, and it had neither of the two properties that
 * makes one useful.
 *
 * It sorted by startDate ascending with no lower bound, so it opened on the
 * oldest events in the catalogue — 103 of them already in the past for the
 * first speaker who looked. Scoring deliberately skips past events, so the
 * scored ones began at row 104 and the visible top of the list could never
 * have a score on it. The page looked unchanged after scoring 100 events.
 *
 * And it ordered by date rather than score, so even once the past was gone a
 * 92 and a 12 sat side by side. Ranking is the entire product of scoring; the
 * list has to use it or the scores are decoration.
 */

/** Rows the inbox ranks. Only the two fields the ordering reads. */
export interface RankableRow {
  relevancyScore?: number | null;
  startDate?: Date | string | null;
}

function time(d: Date | string | null | undefined): number {
  if (!d) return Number.POSITIVE_INFINITY;           // undated sorts after dated
  const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/**
 * Best opportunities first: score descending, then soonest.
 *
 * Unscored rows sort *after* every scored one rather than being treated as
 * zero. A speaker's backlog is mostly unjudged — 1218 of 1321 for the first
 * real profile — and mixing those through the ranking by date would bury the
 * scored ones all over again. They keep their own date order at the bottom,
 * which is where "not yet judged" belongs in a queue you work top-down.
 *
 * A comparator rather than a Prisma `orderBy`: the score lives on the
 * speaker's EventOpportunity, and ordering a parent by a filtered relation's
 * column is not something Prisma expresses. The endpoint already materialises
 * and merges every row, so this costs one sort over data that is in memory.
 */
export function byScoreThenDate(a: RankableRow, b: RankableRow): number {
  const as = a.relevancyScore, bs = b.relevancyScore;
  const aHas = as != null, bHas = bs != null;

  if (aHas !== bHas) return aHas ? -1 : 1;
  if (aHas && bHas && as !== bs) return bs! - as!;

  return time(a.startDate) - time(b.startDate);
}
