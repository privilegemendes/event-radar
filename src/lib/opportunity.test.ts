import { opportunityFromEvent, type EventPersonalFields } from "./opportunity";

function event(over: Partial<EventPersonalFields> = {}): EventPersonalFields {
  return {
    relevancyScore: 72,
    relevancyRationale: "good audience fit",
    acceptanceLikelihood: "MEDIUM",
    acceptanceRationale: "open CFP",
    suggestedAction: "APPLY_TO_SPEAK",
    category: "SPEAK",
    coderRelevant: true,
    status: "APPROVED",
    pitchDraft: "Subject: hello",
    followUpAt: new Date("2026-11-01T00:00:00Z"),
    attending: true,
    readiness: '{"speech_ready":true}',
    prepStage: "PREPARING",
    customTasks: '[{"id":"1","label":"x","done":false}]',
    ownerOnly: true,
    ...over,
  };
}

describe("opportunityFromEvent", () => {
  it("carries every value across unchanged", () => {
    const o = opportunityFromEvent(event());
    expect(o.relevancyScore).toBe(72);
    expect(o.relevancyRationale).toBe("good audience fit");
    expect(o.acceptanceLikelihood).toBe("MEDIUM");
    expect(o.suggestedAction).toBe("APPLY_TO_SPEAK");
    expect(o.category).toBe("SPEAK");
    expect(o.status).toBe("APPROVED");
    expect(o.pitchDraft).toBe("Subject: hello");
    expect(o.attending).toBe(true);
    expect(o.readiness).toBe('{"speech_ready":true}');
    expect(o.prepStage).toBe("PREPARING");
    expect(o.customTasks).toBe('[{"id":"1","label":"x","done":false}]');
    expect(o.followUpAt?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("renames coderRelevant to employerRelevant", () => {
    expect(opportunityFromEvent(event({ coderRelevant: true })).employerRelevant).toBe(true);
    expect(opportunityFromEvent(event({ coderRelevant: false })).employerRelevant).toBe(false);
  });

  it("renames ownerOnly to private", () => {
    expect(opportunityFromEvent(event({ ownerOnly: true })).private).toBe(true);
    expect(opportunityFromEvent(event({ ownerOnly: false })).private).toBe(false);
  });

  it("preserves null rather than coercing it", () => {
    // A null score means "not scored yet", which is not the same as 0 — and a
    // 0 would rank the event as actively bad instead of unknown.
    const o = opportunityFromEvent(event({
      relevancyScore: null, relevancyRationale: null, acceptanceLikelihood: null,
      acceptanceRationale: null, suggestedAction: null, category: null,
      pitchDraft: null, followUpAt: null, readiness: null, prepStage: null, customTasks: null,
    }));
    expect(o.relevancyScore).toBeNull();
    expect(o.category).toBeNull();
    expect(o.followUpAt).toBeNull();
    expect(o.relevancyScore).not.toBe(0);
  });

  it("does not carry across any field that is not a per-speaker opinion", () => {
    // Guards against the catalogue's objective columns leaking onto a
    // per-person row, where they would then diverge per speaker.
    const o = opportunityFromEvent(event());
    for (const leaked of ["title", "startDate", "location", "url", "ticketCost", "isCoderEvent", "partnerId"]) {
      expect(o).not.toHaveProperty(leaked);
    }
  });

  it("produces exactly the 15 opportunity fields", () => {
    expect(Object.keys(opportunityFromEvent(event())).sort()).toEqual([
      "acceptanceLikelihood", "acceptanceRationale", "attending", "category",
      "customTasks", "employerRelevant", "followUpAt", "pitchDraft", "prepStage",
      "private", "readiness", "relevancyRationale", "relevancyScore", "status",
      "suggestedAction",
    ]);
  });
});
