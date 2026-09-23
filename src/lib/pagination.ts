/**
 * Optional pagination for the events list.
 *
 * `GET /api/events` returns EVERY matching row — 1,326 events is ~2.0 MB on the
 * wire, which the app absorbs because the map and calendar genuinely need the
 * whole set. A consumer that cannot absorb it (an LLM tool call, where that
 * payload is roughly half a million tokens) needs a way to ask for less.
 *
 * Deliberately OPT-IN: with no `limit` the query is byte-for-byte what it was,
 * so no existing page changes behaviour and no count query is added to a path
 * that never wanted one. Absent `limit` is "all rows", not a default page.
 *
 * Pure and free of Prisma so it is unit-tested without a database, matching
 * event-filter.ts and profile-schema.ts.
 */

/** Upper bound on one page. Guards against `?limit=100000` undoing the point. */
export const MAX_LIMIT = 200;

export interface Page {
  /** Prisma `take`. Undefined means unbounded — the historical behaviour. */
  take?: number;
  /** Prisma `skip`. Undefined when no offset was asked for. */
  skip?: number;
  /** Whether the caller paginated, and so wants a total to page against. */
  paginated: boolean;
}

/**
 * Read `limit` / `offset` off a query string.
 *
 * Invalid input is ignored rather than rejected: a junk `limit` falls back to
 * the unpaginated default, which is the safe direction — a 400 here would break
 * a page over a typo, while over-returning is merely the old behaviour.
 */
export function parsePage(params: URLSearchParams): Page {
  const take = positiveInt(params.get("limit"));
  const skip = positiveInt(params.get("offset"), { allowZero: true });

  if (take === undefined) {
    // An offset without a limit is meaningless for an unbounded query — the
    // caller would silently lose the first N rows with no way to page past them.
    return { paginated: false };
  }

  return {
    take: Math.min(take, MAX_LIMIT),
    skip: skip && skip > 0 ? skip : undefined,
    paginated: true,
  };
}

function positiveInt(raw: string | null, opts: { allowZero?: boolean } = {}): number | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n)) return undefined;
  if (n < 0 || (n === 0 && !opts.allowZero)) return undefined;
  return n;
}
