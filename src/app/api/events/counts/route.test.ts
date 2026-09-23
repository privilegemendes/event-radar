/**
 * The counts route must keep going through `badgeCountWhere`.
 *
 * #24 fixed four ways the sidebar badges had drifted from the pages behind
 * them by composing the list endpoint's own `speakerConditions` instead of
 * hand-writing a second predicate. Its unit tests pin what that helper returns
 * — but nothing yet checks that this route still *calls* it. A badge quietly
 * rewired back to a hand-written `where`, or to `eventOpportunity.count`, would
 * reintroduce all four and pass the suite.
 *
 * So these read the `where` the route actually issued, rather than composing a
 * fresh one and asserting against that.
 */
import { badgeCountWhere, PODIUM_STATUSES, NO_ROW_STATUS } from "@/lib/event-filter";

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

const USER = "user_never_scored";

/** A MEMBER — not the owner — with no opportunity rows at all. */
const SESSION = {
  userId: USER,
  email: "newcomer@example.com",
  name: "Newcomer",
  role: "MEMBER" as const,
  mustChangePassword: false,
};

/** Which of the three Event counts a given `where` belongs to. */
const isCoderEventsQuery = (w: unknown) => JSON.stringify(w).includes("isCoderEvent");
const isPodiumQuery      = (w: unknown) => JSON.stringify(w).includes("SPOKEN");

const eventCount = db.event.count as unknown as jest.Mock;
const oppCount   = db.eventOpportunity.count as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  (requireSession as jest.Mock).mockResolvedValue(SESSION);

  /* Distinct per badge, so a number reaching the wrong field is visible. */
  eventCount.mockImplementation(({ where }: { where: unknown }) => {
    if (isCoderEventsQuery(where)) return Promise.resolve(12);
    if (isPodiumQuery(where))      return Promise.resolve(3);
    return Promise.resolve(1321);
  });
  oppCount.mockResolvedValue(999); // never read; a call would surface as 999
});

async function body() {
  return (await GET()).json();
}

/** The `where` the route handed to a given badge's count. */
async function whereFor(badge: "inbox" | "podium"): Promise<{ AND: Record<string, unknown>[] }> {
  await GET();
  const issued = eventCount.mock.calls
    .map(([arg]: [{ where: unknown }]) => arg.where)
    .filter((w: unknown) => !isCoderEventsQuery(w));
  const found = issued.find((w: unknown) => isPodiumQuery(w) === (badge === "podium"));
  expect(found).toBeDefined();
  return found as { AND: Record<string, unknown>[] };
}

describe("GET /api/events/counts", () => {
  it("counts both badges over events, never over opportunity rows", async () => {
    // An EventOpportunity count is what made the inbox badge unable to see the
    // events a speaker has no row for, and it cannot carry an Event-level
    // condition like the privacy rule without nesting it.
    await GET();
    expect(oppCount).not.toHaveBeenCalled();
    expect(eventCount).toHaveBeenCalledTimes(3);
  });

  it("asks badgeCountWhere for the inbox badge", async () => {
    await GET();
    expect(eventCount).toHaveBeenCalledWith({ where: badgeCountWhere(USER, "inbox") });
  });

  it("asks badgeCountWhere for the podium badge", async () => {
    const actual   = await whereFor("podium");
    const expected = badgeCountWhere(USER, "podium") as { AND: Record<string, unknown>[] };

    // All but the last condition compared literally; the date window mints its
    // own `new Date()`, so comparing it against a second call turns on whether
    // the clock ticked between them. Its shape is checked below.
    expect(actual.AND).toHaveLength(expected.AND.length);
    expect(JSON.stringify(actual.AND.slice(0, -1))).toBe(JSON.stringify(expected.AND.slice(0, -1)));
  });

  it("routes each count to its own field", async () => {
    expect(await body()).toEqual({ inbox: 1321, gigs: 3, coderEvents: 12 });
  });

  /* The four drifts #24 closed, asserted against what this route issues. */

  it("inbox: counts events this speaker has never been scored against", async () => {
    const [, status] = (await whereFor("inbox")).AND;
    expect(status.OR).toContainEqual({ opportunities: { none: { userId: USER } } });
    expect(status.OR).toContainEqual({
      opportunities: { some: { userId: USER, status: NO_ROW_STATUS } },
    });
  });

  it("podium: counts a gig already spoken at, not just an accepted one", async () => {
    const [, gig] = (await whereFor("podium")).AND;
    const some = (gig.opportunities as { some: { OR: unknown[] } }).some;
    expect(some.OR).toContainEqual({ status: { in: PODIUM_STATUSES } });
  });

  it("podium: bounds the count at today, as the page does", async () => {
    const { AND } = await whereFor("podium");
    const [undated, dated] = AND[AND.length - 1].OR as Record<string, unknown>[];
    expect(undated).toEqual({ startDate: null });
    const gte = (dated.startDate as { gte: Date }).gte;
    expect(Math.abs(gte.getTime() - Date.now())).toBeLessThan(1000);
  });

  it("both: hide only what ANOTHER speaker marked private", async () => {
    // The owner-era rule filtered on the speaker's own row, hiding a private
    // event from the one person entitled to see it.
    const privacy = { opportunities: { none: { private: true, NOT: { userId: USER } } } };
    expect((await whereFor("inbox")).AND[0]).toEqual(privacy);
    expect((await whereFor("podium")).AND[0]).toEqual(privacy);
  });

  it("leaves the Coder Events badge an event-level count", async () => {
    await GET();
    expect(eventCount).toHaveBeenCalledWith({
      where: { isCoderEvent: true, region: { in: ["Europe", "UK"] } },
    });
  });
});
