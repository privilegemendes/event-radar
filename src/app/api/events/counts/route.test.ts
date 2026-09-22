/**
 * The sidebar badge must agree with the page it links to.
 *
 * `speakerConditions` deliberately matches an inbox event either when this
 * speaker's opportunity is DISCOVERED *or* when they have no row at all, so
 * that an event nobody has judged still shows up. This route counted
 * `EventOpportunity` rows, which can only see the first half — so a speaker
 * with no rows yet read "0 to triage" above an inbox listing 1321 events. Five
 * of the six accounts in the dev database were in exactly that state.
 *
 * These tests assert the two queries are built from the same helper, which is
 * the only thing that stops them drifting again.
 */
import { speakerConditions, NO_ROW_STATUS } from "@/lib/event-filter";

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

const eventCount = db.event.count as unknown as jest.Mock;
const oppCount   = db.eventOpportunity.count as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  (requireSession as jest.Mock).mockResolvedValue(SESSION);

  /* Stands in for the reproduction: 1321 events are visible to this speaker,
     12 of them Coder events, and they own not one opportunity row. */
  eventCount.mockImplementation(({ where }: { where: unknown }) =>
    Promise.resolve(JSON.stringify(where).includes("opportunities") ? 1321 : 12),
  );
  oppCount.mockResolvedValue(0);
});

async function body() {
  return (await GET()).json();
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

  it("leaves the gigs badge counting materialised rows", async () => {
    // Confirmed, not assumed: ACCEPTED and attending are not what a missing row
    // defaults to (DISCOVERED / false), so gigs has no no-row half to miss —
    // which is why the podium filter passes matchesDefault=false for both.
    await GET();
    expect(oppCount).toHaveBeenCalledTimes(1);
    expect(oppCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: USER,
        OR: [{ status: "ACCEPTED" }, { attending: true }],
      }),
    });
    expect((await body()).gigs).toBe(0);
  });

  it("leaves the Coder Events badge an event-level count", async () => {
    await GET();
    expect(eventCount).toHaveBeenCalledWith({
      where: { isCoderEvent: true, region: { in: ["Europe", "UK"] } },
    });
    expect((await body()).coderEvents).toBe(12);
  });
});
