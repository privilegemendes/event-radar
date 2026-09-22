import {
  buildScoringPrompt,
  extractScoreArray,
  normaliseScore,
  renderEventFacts,
  resolveIndex,
  type ScorableEvent,
} from "./scoring-parse";

function ev(over: Partial<ScorableEvent> = {}): ScorableEvent {
  return {
    id: "evt_1",
    title: "AI Summit Amsterdam",
    type: "CONFERENCE",
    startDate: new Date("2026-11-04T00:00:00Z"),
    location: "Amsterdam, NL",
    isOnline: false,
    description: "Two days on applied AI.",
    audienceDescription: "startup founders",
    audienceSize: 800,
    ticketCost: "From €99",
    ...over,
  };
}

describe("renderEventFacts", () => {
  it("renders the facts a speaker would judge on", () => {
    const out = renderEventFacts(ev(), 0);
    expect(out).toContain('#0: "AI Summit Amsterdam"');
    expect(out).toContain("Amsterdam, NL");
    expect(out).toContain("2026-11-04");
    expect(out).toContain("audience: startup founders (~800)");
    expect(out).toContain("ticket: From €99");
  });

  it("says so when an event has no date, rather than omitting the line", () => {
    // A recurring meetup is a legitimate catalogue entry. Dropping the line
    // silently would let the model assume a date it was never given.
    expect(renderEventFacts(ev({ startDate: null }), 3)).toContain("date: recurring or unannounced");
  });

  it("falls back through location, city and region", () => {
    expect(renderEventFacts(ev({ location: null, city: "Berlin" }), 0)).toContain("Berlin");
    expect(renderEventFacts(ev({ location: null, city: null, region: "EUROPE" }), 0)).toContain("EUROPE");
    expect(renderEventFacts(ev({ location: null, city: null, region: null }), 0)).toContain("location unknown");
    expect(renderEventFacts(ev({ isOnline: true }), 0)).toContain("Online");
  });

  it("drops facts the catalogue does not have instead of writing empty labels", () => {
    const out = renderEventFacts(ev({ ticketCost: null, audienceDescription: null, audienceSize: null, description: null }), 0);
    expect(out).not.toContain("ticket:");
    expect(out).not.toContain("audience");
    expect(out).not.toContain("about:");
  });

  it("survives an unparseable date", () => {
    expect(renderEventFacts(ev({ startDate: "not a date" }), 0)).toContain("date: recurring or unannounced");
  });
});

describe("buildScoringPrompt", () => {
  const prompt = buildScoringPrompt("SPEAKER: Julia", "RUBRIC: 90-100 ...", [ev(), ev({ id: "evt_2", title: "Devcon" })]);

  it("carries the speaker's own brief and rubric", () => {
    expect(prompt).toContain("SPEAKER: Julia");
    expect(prompt).toContain("RUBRIC: 90-100");
  });

  it("forbids web search", () => {
    // Not cosmetic: a web search here would rebuild the discovery bill once
    // per speaker, which is the whole thing the split exists to avoid.
    expect(prompt).toContain("Do not\nsearch the web");
  });

  it("asks for exactly as many objects as events", () => {
    expect(prompt).toContain("array of exactly 2 objects");
  });
});

describe("extractScoreArray", () => {
  const arr = '[{"index":0,"relevancyScore":80}]';

  it("parses a bare array", () => {
    expect(extractScoreArray(arr)).toHaveLength(1);
  });

  it("parses a fenced array", () => {
    expect(extractScoreArray("```json\n" + arr + "\n```")).toHaveLength(1);
  });

  it("parses an array with prose either side", () => {
    expect(extractScoreArray("Here you go:\n" + arr + "\nHope that helps.")).toHaveLength(1);
  });

  it("returns null for a reply with no array in it", () => {
    expect(extractScoreArray("I could not score these.")).toBeNull();
    expect(extractScoreArray("")).toBeNull();
  });

  it("returns null rather than a half-parsed array for broken JSON", () => {
    expect(extractScoreArray('[{"index":0,')).toBeNull();
  });

  it("does not mistake a JSON object for the array", () => {
    expect(extractScoreArray('{"index":0,"relevancyScore":80}')).toBeNull();
  });
});

describe("normaliseScore", () => {
  it("keeps a well-formed judgement", () => {
    const s = normaliseScore({
      relevancyScore: 82,
      relevancyRationale: "her exact audience",
      acceptanceLikelihood: "HIGH",
      acceptanceRationale: "open CFP",
      suggestedAction: "APPLY_TO_SPEAK",
      category: "SPEAK",
      employerRelevant: true,
    });
    expect(s.relevancyScore).toBe(82);
    expect(s.acceptanceLikelihood).toBe("HIGH");
    expect(s.category).toBe("SPEAK");
    expect(s.employerRelevant).toBe(true);
  });

  it("clamps a score to 0-100 and rounds it", () => {
    expect(normaliseScore({ relevancyScore: 140 }).relevancyScore).toBe(100);
    expect(normaliseScore({ relevancyScore: -20 }).relevancyScore).toBe(0);
    expect(normaliseScore({ relevancyScore: 72.6 }).relevancyScore).toBe(73);
  });

  it("nulls an unusable score instead of storing NaN", () => {
    expect(normaliseScore({ relevancyScore: "high" }).relevancyScore).toBeNull();
    expect(normaliseScore({}).relevancyScore).toBeNull();
    expect(normaliseScore({ relevancyScore: null }).relevancyScore).toBeNull();
  });

  it("nulls an enum value outside the allowed set", () => {
    // An unscored row reads as "not judged yet" in the UI; a junk enum is a
    // rendering bug, so out-of-set values must not reach the database.
    const s = normaliseScore({ acceptanceLikelihood: "VERY_HIGH", suggestedAction: "SPONSOR", category: "WATCH" });
    expect(s.acceptanceLikelihood).toBeNull();
    expect(s.suggestedAction).toBeNull();
    expect(s.category).toBeNull();
  });

  it("treats employerRelevant as true only when it is exactly true", () => {
    expect(normaliseScore({ employerRelevant: "yes" }).employerRelevant).toBe(false);
    expect(normaliseScore({ employerRelevant: 1 }).employerRelevant).toBe(false);
    expect(normaliseScore({}).employerRelevant).toBe(false);
  });

  it("nulls a blank rationale rather than storing whitespace", () => {
    expect(normaliseScore({ relevancyRationale: "   " }).relevancyRationale).toBeNull();
  });

  it("does not throw on junk", () => {
    expect(() => normaliseScore(null)).not.toThrow();
    expect(() => normaliseScore("nope")).not.toThrow();
  });
});

describe("resolveIndex", () => {
  it("prefers the index the model declared", () => {
    expect(resolveIndex({ index: 4 }, 0, 10)).toBe(4);
  });

  it("falls back to position when no index is given", () => {
    expect(resolveIndex({}, 3, 10)).toBe(3);
  });

  it("refuses an out-of-range index instead of falling back to position", () => {
    // Falling back here would write one event's judgement onto a different
    // event — worse than leaving it unscored.
    expect(resolveIndex({ index: 99 }, 0, 10)).toBeNull();
    expect(resolveIndex({ index: -1 }, 0, 10)).toBeNull();
  });

  it("refuses a position past the end of the batch", () => {
    expect(resolveIndex({}, 12, 10)).toBeNull();
  });

  it("ignores a non-integer index and uses the position", () => {
    expect(resolveIndex({ index: "2" }, 5, 10)).toBe(5);
    expect(resolveIndex({ index: 2.5 }, 5, 10)).toBe(5);
  });
});
