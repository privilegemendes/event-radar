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

/**
 * What puts an event on this speaker's podium: a gig they accepted or have
 * already spoken at, or one they are attending.
 *
 * The per-speaker half only — the date half is `upcomingOrDateless()`. Both
 * callers wrap it in `mine()`, so it says what a gig is without saying whose.
 *
 * SPOKEN belongs here with ACCEPTED: a talk you have given is still yours, and
 * dropping off the podium the moment it is marked spoken would lose it from the
 * page before the event date has even passed.
 */
export function podiumMatch(): Condition {
  return { OR: [{ status: { in: ["ACCEPTED", "SPOKEN"] } }, { attending: true }] };
}

/**
 * The podium's other half: gigs that have not happened yet.
 *
 * A fact about the event rather than about anyone's opinion of it, so it is not
 * part of `speakerConditions` — both the list route and `podiumCountWhere` AND
 * it onto the Event where. A function rather than a constant because
 * `new Date()` has to be evaluated per request, not once at module load.
 */
export function upcomingOrDateless(): Condition {
  return { OR: [{ startDate: null }, { startDate: { gte: new Date() } }] };
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
    // Wrapped in `mine` so it is this speaker's own acceptance that counts —
    // another speaker's must not pull an event onto my podium.
    out.push(mine(userId, podiumMatch(), false));
  }

  return out;
}

/**
 * The query behind the sidebar's "to triage" badge.
 *
 * It counts **events**, not `EventOpportunity` rows, and that is the whole
 * point. `speakerConditions` matches an event for the inbox either when this
 * speaker's opportunity is DISCOVERED *or* when they have no row at all (see
 * `NO_ROW_STATUS`); a count over `EventOpportunity` can only ever see the first
 * half of that. So a speaker who has never been scored — every account in the
 * dev database bar one — got a badge reading 0 above an inbox page listing
 * 1321 events.
 *
 * Built from `speakerConditions` with the same params `/inbox` sends
 * (`?status=DISCOVERED`) rather than a second hand-rolled predicate, so the
 * badge and the list cannot drift apart again.
 */
export function inboxCountWhere(userId: string): Condition {
  return { AND: speakerConditions(userId, { status: NO_ROW_STATUS }) };
}

/**
 * The query behind the sidebar's gigs badge — the `/podiums` where clause.
 *
 * The badge restated that clause and got every part of it wrong in turn: it
 * counted gigs that had already happened, missed ones marked SPOKEN, and
 * filtered privacy on the speaker's own row (hiding a gig from the one person
 * entitled to see it) instead of on other speakers'. Composed here from the
 * same two helpers the list route composes, so there is nothing left to
 * restate.
 *
 * Counting events rather than opportunity rows is what makes it the list's
 * clause verbatim, and the two agree: `@@unique([userId, eventId])` means a
 * qualifying event has exactly one qualifying row of this speaker's.
 */
export function podiumCountWhere(userId: string): Condition {
  return { AND: [...speakerConditions(userId, { view: "podium" }), upcomingOrDateless()] };
}
