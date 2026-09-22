import {
  mine,
  notPrivateToOthers,
  speakerConditions,
  badgeCountWhere,
  upcomingOrUndated,
  NO_ROW_STATUS,
} from "./event-filter";

const ME = "user_me";

/** Pull the `some`/`none` payload out of whichever shape `mine` returned. */
function branches(c: Record<string, unknown>) {
  const or = c.OR as Record<string, unknown>[] | undefined;
  return or ?? [c];
}

describe("mine", () => {
  it("scopes the match to this speaker's own row", () => {
    const c = mine(ME, { status: "APPROVED" }, false);
    expect(c).toEqual({ opportunities: { some: { userId: ME, status: "APPROVED" } } });
  });

  it("also matches events with no row when the value is the default", () => {
    // An event nobody has judged reads as DISCOVERED; without this branch the
    // inbox would be empty for a speaker who has never been scored.
    const c = mine(ME, { status: "DISCOVERED" }, true);
    expect(branches(c)).toHaveLength(2);
    expect(branches(c)[1]).toEqual({ opportunities: { none: { userId: ME } } });
  });

  it("does not add the no-row branch for a non-default value", () => {
    expect(branches(mine(ME, { status: "APPROVED" }, false))).toHaveLength(1);
  });

  it("never matches on another speaker's row", () => {
    const json = JSON.stringify(mine(ME, { status: "APPROVED" }, false));
    expect(json).toContain(ME);
    expect(json.match(/userId/g)).toHaveLength(1);
  });
});

describe("notPrivateToOthers", () => {
  const c = notPrivateToOthers(ME);

  it("excludes events another speaker marked private", () => {
    expect(c).toEqual({ opportunities: { none: { private: true, NOT: { userId: ME } } } });
  });

  it("keeps my own private events visible to me", () => {
    // The NOT is the whole point: without it, marking an event private would
    // hide it from the person who marked it.
    const none = (c.opportunities as { none: Record<string, unknown> }).none;
    expect(none.NOT).toEqual({ userId: ME });
  });
});

describe("speakerConditions", () => {
  it("always applies the privacy rule", () => {
    expect(speakerConditions(ME, {})).toEqual([notPrivateToOthers(ME)]);
  });

  it("treats a DISCOVERED filter as including unjudged events", () => {
    const [, statusCond] = speakerConditions(ME, { status: NO_ROW_STATUS });
    expect(branches(statusCond)).toHaveLength(2);
  });

  it("treats any other status as requiring a row", () => {
    const [, statusCond] = speakerConditions(ME, { status: "APPROVED" });
    expect(branches(statusCond)).toHaveLength(1);
  });

  it("filters category through the opportunity, never the event", () => {
    const [, cat] = speakerConditions(ME, { category: "SPEAK" });
    expect(cat).toEqual({ opportunities: { some: { userId: ME, category: "SPEAK" } } });
  });

  it("maps the coderRelevant wire name onto the employerRelevant column", () => {
    const [, yes] = speakerConditions(ME, { coderRelevant: "true" });
    expect(JSON.stringify(yes)).toContain("employerRelevant");
    expect(JSON.stringify(yes)).not.toContain("coderRelevant");
  });

  it("includes unjudged events when filtering for coderRelevant=false", () => {
    // false is the default, so an event with no row qualifies.
    const [, no] = speakerConditions(ME, { coderRelevant: "false" });
    expect(branches(no)).toHaveLength(2);
  });

  it("ignores a coderRelevant value that is neither true nor false", () => {
    expect(speakerConditions(ME, { coderRelevant: "maybe" })).toHaveLength(1);
  });

  it("scopes the podium to this speaker's own acceptances", () => {
    // The bug this replaces: the podium tested Event.status, which stopped
    // changing once Phase 2 routed approvals to the opportunity.
    const [, podium] = speakerConditions(ME, { view: "podium" });
    const some = (podium.opportunities as { some: Record<string, unknown> }).some;
    expect(some.userId).toBe(ME);
    expect(some.OR).toEqual([{ status: { in: ["ACCEPTED", "SPOKEN"] } }, { attending: true }]);
  });

  it("does not let an unjudged event onto the podium", () => {
    const [, podium] = speakerConditions(ME, { view: "podium" });
    expect(branches(podium)).toHaveLength(1);
  });

  it("composes several filters as separate AND-able conditions", () => {
    const out = speakerConditions(ME, { status: "APPROVED", category: "SPEAK", coderRelevant: "true" });
    expect(out).toHaveLength(4); // privacy + status + category + employerRelevant
  });

  it("returns conditions to AND, never a bare OR that would clobber search", () => {
    // Each condition is its own array entry precisely so the caller can AND
    // them alongside the search term's own OR.
    for (const c of speakerConditions(ME, { status: NO_ROW_STATUS, view: "podium" })) {
      expect(Object.keys(c)).toHaveLength(1);
    }
  });
});

/* ── Badge counts must match the page behind them ─────────────────────────
 * The sidebar's numbers were built from their own hand-written predicates and
 * had drifted from the list endpoint's in three ways. Each of these pins one
 * difference that was live.
 */

describe("upcomingOrUndated", () => {
  const NOW = new Date("2026-09-22T12:00:00Z");

  it("keeps undated events", () => {
    // A recurring meetup with no date is still ahead of you.
    expect(upcomingOrUndated(NOW).OR).toContainEqual({ startDate: null });
  });

  it("keeps events from now onward", () => {
    expect(upcomingOrUndated(NOW).OR).toContainEqual({ startDate: { gte: NOW } });
  });
});

describe("badgeCountWhere", () => {
  const ME = "user_me";
  const NOW = new Date("2026-09-22T12:00:00Z");

  it("gives the podium badge the date window the page has", () => {
    // The reported bug: an ACCEPTED gig dated three days ago kept its badge
    // while the page it linked to was empty.
    const where = badgeCountWhere(ME, "podium", NOW);
    const conds = where.AND as Record<string, unknown>[];
    expect(conds).toContainEqual(upcomingOrUndated(NOW));
  });

  it("counts SPOKEN as well as ACCEPTED, like the page", () => {
    // The badge counted ACCEPTED only, so a SPOKEN gig showed on the page and
    // not in the number above it.
    expect(JSON.stringify(badgeCountWhere(ME, "podium", NOW))).toContain("SPOKEN");
  });

  it("counts an unjudged event in the inbox badge, like the page", () => {
    // A speaker who has never been scored has no opportunity rows at all. The
    // old count read those rows directly and returned 0 behind a full inbox —
    // which every account created through open sign-up would have hit.
    const where = badgeCountWhere(ME, "inbox", NOW);
    expect(JSON.stringify(where)).toContain('"none"');
  });

  it("uses the same privacy rule as the page", () => {
    // The old count hid a speaker's own private events from their own badge
    // unless they were the owner; the page shows them.
    for (const badge of ["inbox", "podium"] as const) {
      expect(badgeCountWhere(ME, badge, NOW)).toEqual(
        expect.objectContaining({ AND: expect.arrayContaining([notPrivateToOthers(ME)]) }),
      );
    }
  });

  it("builds the podium count from exactly the page's conditions plus the date", () => {
    // Stated as an equality so the two cannot drift again silently.
    expect(badgeCountWhere(ME, "podium", NOW)).toEqual({
      AND: [...speakerConditions(ME, { view: "podium" }), upcomingOrUndated(NOW)],
    });
  });

  it("builds the inbox count from exactly the page's conditions", () => {
    expect(badgeCountWhere(ME, "inbox", NOW)).toEqual({
      AND: speakerConditions(ME, { status: "DISCOVERED" }),
    });
  });
});
