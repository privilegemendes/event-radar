import {
  opportunityFromEvent, defaultOpportunity, mergeEventWithOpportunity, splitEventUpdate,
  type EventPersonalFields,
} from "./opportunity";

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

describe("defaultOpportunity", () => {
  it("gives a usable value for every field rather than undefined", () => {
    const d = defaultOpportunity();
    // An undefined score renders as "undefined"; an undefined status breaks
    // the pipeline filters. A speaker with no row yet must still be renderable.
    expect(d.status).toBe("DISCOVERED");
    expect(d.attending).toBe(false);
    expect(d.employerRelevant).toBe(false);
    expect(d.private).toBe(false);
    expect(d.relevancyScore).toBeNull();
    for (const v of Object.values(d)) expect(v).not.toBeUndefined();
  });
});

describe("mergeEventWithOpportunity", () => {
  const event = { id: "e1", title: "KubeCon", startDate: "2027-03-01", ticketCost: "€900" };

  it("returns a flat object carrying both sides", () => {
    const m = mergeEventWithOpportunity(event, { relevancyScore: 72, category: "SPEAK" });
    expect(m.title).toBe("KubeCon");
    expect(m.ticketCost).toBe("€900");
    expect(m.relevancyScore).toBe(72);
    expect(m.category).toBe("SPEAK");
  });

  it("falls back to defaults when the speaker has no opportunity", () => {
    const m = mergeEventWithOpportunity(event, null);
    expect(m.title).toBe("KubeCon");
    expect(m.relevancyScore).toBeNull();
    expect(m.status).toBe("DISCOVERED");
    expect(m.attending).toBe(false);
  });

  it("exposes storage names under the wire names the app already reads", () => {
    const m = mergeEventWithOpportunity(event, { employerRelevant: true, private: true });
    expect(m.coderRelevant).toBe(true);
    expect(m.ownerOnly).toBe(true);
    expect(m).not.toHaveProperty("employerRelevant");
    expect(m).not.toHaveProperty("private");
  });

  it("drops the raw relation so it cannot leak to the client", () => {
    const m = mergeEventWithOpportunity({ ...event, opportunities: [{ userId: "someone-else" }] }, null);
    expect(m).not.toHaveProperty("opportunities");
  });

  it("never lets one speaker's value survive when merging another's", () => {
    const mine = mergeEventWithOpportunity(event, { relevancyScore: 10 });
    const theirs = mergeEventWithOpportunity(event, { relevancyScore: 90 });
    expect(mine.relevancyScore).toBe(10);
    expect(theirs.relevancyScore).toBe(90);
  });
});

describe("splitEventUpdate", () => {
  it("routes per-speaker fields to the opportunity", () => {
    const { eventData, opportunityData } = splitEventUpdate({
      title: "New title", status: "APPROVED", relevancyScore: 80, attending: true,
    });
    expect(eventData).toEqual({ title: "New title" });
    expect(opportunityData).toEqual({ status: "APPROVED", relevancyScore: 80, attending: true });
  });

  it("translates the wire names to storage names", () => {
    const { opportunityData } = splitEventUpdate({ coderRelevant: true, ownerOnly: true });
    expect(opportunityData).toEqual({ employerRelevant: true, private: true });
  });

  it("sends unrecognised fields to the event, so objective columns keep working", () => {
    // A new catalogue column must not need listing here; a new per-speaker one must.
    const { eventData, opportunityData } = splitEventUpdate({ somethingNew: "x", ticketCost: "Free" });
    expect(eventData).toEqual({ somethingNew: "x", ticketCost: "Free" });
    expect(opportunityData).toEqual({});
  });

  it("keeps a field that is present but null, so it can be cleared", () => {
    const { opportunityData } = splitEventUpdate({ pitchDraft: null });
    expect(opportunityData).toHaveProperty("pitchDraft", null);
  });
});
