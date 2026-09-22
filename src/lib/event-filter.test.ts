import {
  mine,
  notPrivateToOthers,
  speakerConditions,
  inboxCountWhere,
  upcomingOrDateless,
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

describe("inboxCountWhere", () => {
  const and = inboxCountWhere(ME).AND as Record<string, unknown>[];

  it("is the inbox list's own conditions, AND-ed", () => {
    // Same helper, same params `/inbox` sends. The badge and the page it links
    // to disagreed because the badge had a predicate of its own.
    expect(inboxCountWhere(ME)).toEqual({ AND: speakerConditions(ME, { status: NO_ROW_STATUS }) });
  });

  it("matches events this speaker has no opportunity row for", () => {
    // The half a count over EventOpportunity cannot reach, and the reason the
    // badge read 0 for every speaker who had never been scored.
    const [, status] = and;
    expect(branches(status)).toContainEqual({ opportunities: { none: { userId: ME } } });
  });

  it("matches this speaker's own DISCOVERED rows", () => {
    const [, status] = and;
    expect(branches(status)).toContainEqual({ opportunities: { some: { userId: ME, status: NO_ROW_STATUS } } });
  });

  it("still excludes what another speaker marked private", () => {
    expect(and).toContainEqual(notPrivateToOthers(ME));
  });

  it("never reaches another speaker's row", () => {
    const json = JSON.stringify(inboxCountWhere(ME));
    expect(json.match(new RegExp(ME, "g"))).toHaveLength(3); // privacy NOT + the two status branches
  });
});

describe("upcomingOrDateless", () => {
  it("keeps gigs with no date at all", () => {
    // A gig with no startDate yet is still ahead of you, not behind.
    expect(branches(upcomingOrDateless())).toContainEqual({ startDate: null });
  });

  it("bounds the rest at now", () => {
    const [, dated] = branches(upcomingOrDateless());
    const gte = (dated.startDate as { gte: Date }).gte;
    expect(gte).toBeInstanceOf(Date);
    expect(Math.abs(gte.getTime() - Date.now())).toBeLessThan(1000);
  });

  it("re-reads the clock on every call", async () => {
    // A module-level constant would freeze `now` at import and drift further
    // out of date for as long as the server process lives.
    const first = (branches(upcomingOrDateless())[1].startDate as { gte: Date }).gte;
    await new Promise((r) => setTimeout(r, 5));
    const second = (branches(upcomingOrDateless())[1].startDate as { gte: Date }).gte;
    expect(second.getTime()).toBeGreaterThan(first.getTime());
  });
});
