/**
 * Each sidebar badge must agree with the page it links to.
 *
 * Both used to restate that page's where clause instead of composing it, and
 * both drifted. The inbox badge counted `EventOpportunity` rows, so it could
 * not see the events a speaker has no row for — every account in the dev
 * database bar one read "0 to triage" above an inbox listing 1321. The gigs
 * badge counted gigs that had already happened, missed ones marked SPOKEN, and
 * filtered privacy on the speaker's own row.
 *
 * These tests assert each badge is built from the same helpers its page is,
 * which is the only thing that stops them drifting again.
 */
import {
  speakerConditions,
  podiumCountWhere,
  NO_ROW_STATUS,
} from "@/lib/event-filter";

jest.mock("@/lib/db", () => ({
  db: {
    event:            { count: jest.fn() },
    eventOpportunity: { count: jest.fn() },
  },
}));

jest.mock("@/lib/session", () => ({
  requireSession:    jest.fn(),
  authErrorResponse: jest.fn(() => null),
}));

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { GET } from "./route";

const USER = "user_no_rows_yet";

/** A MEMBER — not the owner — with no opportunity rows at all. */
const SESSION = {
  userId: USER,
  email: "newcomer@example.com",
  name: "Newcomer",
  role: "MEMBER" as const,
  mustChangePassword: false,
};

/** What `/inbox` itself asks for: `?status=DISCOVERED&view=inbox`. */
const INBOX_WHERE = { AND: speakerConditions(USER, { status: NO_ROW_STATUS }) };

/** Which of the three Event counts a given `where` belongs to. */
const isCoderEventsQuery = (w: unknown) => JSON.stringify(w).includes("isCoderEvent");
const isPodiumQuery      = (w: unknown) => JSON.stringify(w).includes("SPOKEN");

const eventCount = db.event.count as unknown as jest.Mock;
const oppCount   = db.eventOpportunity.count as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  (requireSession as jest.Mock).mockResolvedValue(SESSION);

  /* Stands in for the reproduction: 1321 events are visible to this speaker,
     12 of them Coder events, 3 of them upcoming gigs. */
  eventCount.mockImplementation(({ where }: { where: unknown }) => {
    if (isCoderEventsQuery(where)) return Promise.resolve(12);
    if (isPodiumQuery(where))      return Promise.resolve(3);
    return Promise.resolve(1321);
  });
  oppCount.mockResolvedValue(999); // never read; a call would show up as 999
});

async function body() {
  return (await GET()).json();
}

/** The `where` the route actually handed to the gigs count. */
async function podiumWhere(): Promise<{ AND: Record<string, unknown>[] }> {
  await GET();
  const found = eventCount.mock.calls
    .map(([arg]: [{ where: unknown }]) => arg.where)
    .find(isPodiumQuery);
  expect(found).toBeDefined();
  return found as { AND: Record<string, unknown>[] };
}

describe("GET /api/events/counts", () => {
  it("counts the inbox over events, with the inbox list's own conditions", async () => {
    await GET();
    expect(eventCount).toHaveBeenCalledWith({ where: INBOX_WHERE });
  });

  it("reports what the inbox page lists for a speaker with no rows yet", async () => {
    // The bug: 0 in the badge, 1321 on the page.
    expect((await body()).inbox).toBe(1321);
  });

  it("includes events this speaker has never been scored against", async () => {
    // Spelled out rather than left to the INBOX_WHERE comparison above, so a
    // change to `speakerConditions` that dropped the no-row branch would fail
    // here loudly instead of moving both sides of that equality together.
    const [, status] = INBOX_WHERE.AND;
    expect(status.OR).toContainEqual({ opportunities: { none: { userId: USER } } });
  });

  it("still hides events another speaker marked private", async () => {
    const [privacy] = INBOX_WHERE.AND;
    expect(privacy).toEqual({ opportunities: { none: { private: true, NOT: { userId: USER } } } });
  });

  it("counts the gigs badge with the /podiums where clause verbatim", async () => {
    await GET();
    const podium = eventCount.mock.calls
      .map(([arg]: [{ where: unknown }]) => arg.where)
      .find(isPodiumQuery);
    expect(podium).toBeDefined();

    // Compared against a freshly composed clause by shape, because the date
    // half mints its own `new Date()` — a literal toEqual would pass or fail on
    // whether the clock ticked between the two calls.
    const expected = podiumCountWhere(USER) as { AND: Record<string, unknown>[] };
    const actual   = podium as { AND: Record<string, unknown>[] };
    expect(actual.AND).toHaveLength(expected.AND.length);
    expect(JSON.stringify(actual.AND.slice(0, -1))).toBe(JSON.stringify(expected.AND.slice(0, -1)));
  });

  it("reports the count of that query as the gigs badge", async () => {
    expect((await body()).gigs).toBe(3);
  });

  it("counts a gig marked SPOKEN, as /podiums lists it", async () => {
    // The badge matched ACCEPTED alone, so a talk already given vanished from
    // it while the page went on showing it.
    const [, gig] = (await podiumWhere()).AND;
    const some = (gig.opportunities as { some: { OR: unknown[] } }).some;
    expect(some.OR).toContainEqual({ status: { in: ["ACCEPTED", "SPOKEN"] } });
  });

  it("bounds the gigs badge at today, as /podiums does", async () => {
    // The badge read 1 above a page listing 0, because it counted a gig that
    // had already happened.
    const { AND } = await podiumWhere();
    const [dateless, dated] = AND[AND.length - 1].OR as Record<string, unknown>[];
    expect(dateless).toEqual({ startDate: null });

    // By shape, not against a second upcomingOrDateless(): both mint their own
    // `new Date()`, so a literal comparison turns on whether the clock ticked.
    const gte = (dated.startDate as { gte: Date }).gte;
    expect(Math.abs(gte.getTime() - Date.now())).toBeLessThan(1000);
  });

  it("hides only what ANOTHER speaker marked private, never my own gig", async () => {
    // The badge used `private: false` on the speaker's own row, which hid a
    // private gig from the one person entitled to see it — and, for the owner,
    // dropped the privacy test altogether.
    const [privacy] = (await podiumWhere()).AND;
    expect(privacy).toEqual({ opportunities: { none: { private: true, NOT: { userId: USER } } } });
  });

  it("no longer counts opportunity rows for either badge", async () => {
    // Both badges are Event counts now; an EventOpportunity count cannot carry
    // an Event-level condition like the privacy rule without nesting it.
    await GET();
    expect(oppCount).not.toHaveBeenCalled();
  });

  it("leaves the Coder Events badge an event-level count", async () => {
    await GET();
    expect(eventCount).toHaveBeenCalledWith({
      where: { isCoderEvent: true, region: { in: ["Europe", "UK"] } },
    });
    expect((await body()).coderEvents).toBe(12);
  });
});
