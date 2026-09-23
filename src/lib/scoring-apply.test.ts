/**
 * applyScores is where a score judged OUTSIDE this server enters the database.
 *
 * Two properties carry the weight, and both are easy to lose in a refactor
 * because neither shows up as a failure — they show up as corrupted or
 * silently overwritten data:
 *
 *   - every entry goes through normaliseScore, so a connector's output is no
 *     more trusted than a model's;
 *   - a row that already carries a score is never overwritten, which is what
 *     the server path gets for free by only selecting unscored events.
 *
 * These read what the function actually issued to the database rather than
 * composing an expectation and asserting against itself, following the pattern
 * in api/events/counts/route.test.ts.
 */
jest.mock("@/lib/db", () => ({
  db: {
    event: { findMany: jest.fn() },
    eventOpportunity: { upsert: jest.fn() },
    speakerProfile: { findUnique: jest.fn() },
  },
}));

import { db } from "@/lib/db";
import { applyScores } from "./scoring";

const mockDb = db as unknown as {
  event: { findMany: jest.Mock };
  eventOpportunity: { upsert: jest.Mock };
};

/** `known` maps eventId -> the score already on that speaker's row (null = unscored). */
const catalogue = (known: Record<string, number | null | undefined>) => {
  mockDb.event.findMany.mockResolvedValue(
    Object.entries(known).map(([id, relevancyScore]) => ({
      id,
      opportunities: relevancyScore === undefined ? [] : [{ relevancyScore }],
    })),
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.eventOpportunity.upsert.mockResolvedValue({});
});

describe("applyScores", () => {
  it("writes a valid entry to the caller's own row", async () => {
    catalogue({ e1: null });
    const out = await applyScores("me", [{ eventId: "e1", relevancyScore: 91, category: "SPEAK" }]);

    expect(out).toEqual({ written: 1, skipped: 0, rejected: 0 });
    const arg = mockDb.eventOpportunity.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ userId_eventId: { userId: "me", eventId: "e1" } });
    expect(arg.update.relevancyScore).toBe(91);
    expect(arg.update.category).toBe("SPEAK");
  });

  it("NEVER overwrites a score that is already set", async () => {
    catalogue({ e1: 91 });
    const out = await applyScores("me", [{ eventId: "e1", relevancyScore: 1 }]);

    expect(out).toEqual({ written: 0, skipped: 1, rejected: 0 });
    expect(mockDb.eventOpportunity.upsert).not.toHaveBeenCalled();
  });

  it("rejects an eventId that is not in the catalogue", async () => {
    catalogue({});
    const out = await applyScores("me", [{ eventId: "ghost", relevancyScore: 50 }]);

    expect(out).toEqual({ written: 0, skipped: 0, rejected: 1 });
    expect(mockDb.eventOpportunity.upsert).not.toHaveBeenCalled();
  });

  it("rejects an entry with no usable eventId", async () => {
    catalogue({});
    const out = await applyScores("me", [{ relevancyScore: 50 } as never]);
    expect(out.rejected).toBe(1);
  });

  it("clamps an out-of-range score rather than storing it", async () => {
    catalogue({ e1: null });
    await applyScores("me", [{ eventId: "e1", relevancyScore: 240 }]);
    expect(mockDb.eventOpportunity.upsert.mock.calls[0][0].update.relevancyScore).toBe(100);
  });

  it("discards a value outside the allowed set instead of storing junk", async () => {
    catalogue({ e1: null });
    await applyScores("me", [{ eventId: "e1", acceptanceLikelihood: "MAYBE", category: "NONSENSE" }]);

    const { update } = mockDb.eventOpportunity.upsert.mock.calls[0][0];
    expect(update.acceptanceLikelihood).toBeNull();
    expect(update.category).toBeNull();
  });

  it("handles a mixed batch without letting one bad entry sink the rest", async () => {
    catalogue({ good: null, taken: 80, ghost: undefined });
    const out = await applyScores("me", [
      { eventId: "good", relevancyScore: 70 },
      { eventId: "taken", relevancyScore: 10 },
      { eventId: "nope", relevancyScore: 10 },
    ]);
    expect(out).toEqual({ written: 1, skipped: 1, rejected: 1 });
  });

  it("does nothing for an empty submission", async () => {
    catalogue({});
    expect(await applyScores("me", [])).toEqual({ written: 0, skipped: 0, rejected: 0 });
  });
});
