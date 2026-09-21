import { EMPTY_PROFILE, type ApplicantProfile } from "./settings";
import {
  parseList,
  parsePronouns,
  speakingLevelOf,
  speakerName,
  buildSpeakerProfile,
  buildScoringRubric,
  buildExclusions,
  buildFocusThemes,
  rotatingFocusFrom,
  buildGeographyLine,
  buildSearchPlan,
  isPrivateEvent,
} from "./speaker-brief";

/** A fully-populated brief, so tests assert on real rendering rather than defaults. */
function profile(overrides: Partial<ApplicantProfile> = {}): ApplicantProfile {
  return {
    ...EMPTY_PROFILE,
    fullName: "Ada Lovelace",
    pronouns: "she/her",
    speakingLevel: "FIRST_TIME",
    signatureTopics: "Sovereign AI\nAI literacy for founders",
    homeGeographies: "Amsterdam, NL\nLondon, UK",
    credentials: "Nomad Cruise 17 AI Edition",
    employerAngle: "EMEA Partner Manager at Coder (AI devtools).",
    excludedDomains: "Cybersecurity conferences\nAcademic ML research venues",
    privateKeywords: "digital nomad\nnomad cruise",
    ...overrides,
  };
}

describe("parseList", () => {
  it("splits on newlines and trims", () => {
    expect(parseList(" a \n b \n")).toEqual(["a", "b"]);
  });

  it("keeps commas inside an entry", () => {
    // Regression: splitting on commas turned "Amsterdam, NL" into two bogus
    // locations, and would do the same to any dated credential.
    expect(parseList("Amsterdam, NL\nLondon, UK")).toEqual(["Amsterdam, NL", "London, UK"]);
  });

  it("returns an empty array for blank input", () => {
    expect(parseList("")).toEqual([]);
    expect(parseList(null)).toEqual([]);
    expect(parseList("  \n  \n")).toEqual([]);
  });
});

describe("parsePronouns", () => {
  it.each([
    ["she/her", "she", "her", "her"],
    ["he/him", "he", "him", "his"],
    ["they/them", "they", "them", "their"],
    ["She/Her", "she", "her", "her"],
  ])("parses %s", (raw, subject, object, possessive) => {
    expect(parsePronouns(raw)).toEqual({ subject, object, possessive });
  });

  it("falls back to they/them when unset or unrecognised", () => {
    expect(parsePronouns("")).toEqual({ subject: "they", object: "them", possessive: "their" });
    expect(parsePronouns("ze/zir")).toEqual({ subject: "they", object: "them", possessive: "their" });
  });
});

describe("speakingLevelOf", () => {
  it("accepts the known levels, case-insensitively", () => {
    expect(speakingLevelOf({ speakingLevel: "keynote" })).toBe("KEYNOTE");
    expect(speakingLevelOf({ speakingLevel: "ESTABLISHED" })).toBe("ESTABLISHED");
  });

  it("falls back to FIRST_TIME for blank or unknown values", () => {
    expect(speakingLevelOf({ speakingLevel: "" })).toBe("FIRST_TIME");
    expect(speakingLevelOf({ speakingLevel: "LEGENDARY" })).toBe("FIRST_TIME");
  });
});

describe("speakerName", () => {
  it("uses the profile name, else a neutral placeholder", () => {
    expect(speakerName({ fullName: "Ada Lovelace" })).toBe("Ada Lovelace");
    expect(speakerName({ fullName: "   " })).toBe("the speaker");
  });
});

describe("buildSpeakerProfile", () => {
  it("names the speaker and renders topics, credentials and employer", () => {
    const out = buildSpeakerProfile(profile());
    expect(out).toContain("Ada Lovelace");
    expect(out).toContain("Sovereign AI, AI literacy for founders");
    expect(out).toContain("Nomad Cruise 17 AI Edition");
    expect(out).toContain("EMEA Partner Manager at Coder");
  });

  it("omits the employer line entirely when there is no employer angle", () => {
    const out = buildSpeakerProfile(profile({ employerAngle: "" }));
    expect(out).not.toContain("Day job");
    expect(out).not.toContain("Coder");
  });

  it("adds an outreach goal only in the outreach form, using the right pronoun", () => {
    expect(buildSpeakerProfile(profile(), "full")).not.toContain("Goal:");
    const outreach = buildSpeakerProfile(profile(), "outreach");
    expect(outreach).toContain("Goal:");
    expect(outreach).toContain("point her to");
  });

  it("uses they/them in outreach when pronouns are unset", () => {
    const out = buildSpeakerProfile(profile({ pronouns: "" }), "outreach");
    expect(out).toContain("point them to");
    expect(out).not.toContain("point her to");
  });

  it("renders the compact form as a single line", () => {
    const out = buildSpeakerProfile(profile(), "compact");
    expect(out).not.toContain("\n");
    expect(out).toContain("Ada Lovelace");
  });

  it("describes the stage and ceiling differently per speaking level", () => {
    const first = buildSpeakerProfile(profile({ speakingLevel: "FIRST_TIME" }));
    const keynote = buildSpeakerProfile(profile({ speakingLevel: "KEYNOTE" }));
    expect(first).toContain("first-time speaker");
    expect(first).toContain("NOT realistic yet");
    expect(keynote).toContain("keynote speaker");
    expect(keynote).toContain("Below the useful range");
    expect(keynote).not.toContain("NOT realistic yet");
  });

  it("stays coherent on a completely empty profile", () => {
    const out = buildSpeakerProfile(EMPTY_PROFILE);
    expect(out).toContain("the speaker");
    expect(out).toContain("not specified");
    expect(out).not.toContain("undefined");
    expect(out).not.toContain("null");
  });
});

describe("buildScoringRubric", () => {
  it("inverts the top and bottom bands between FIRST_TIME and KEYNOTE", () => {
    const first = buildScoringRubric(profile({ speakingLevel: "FIRST_TIME" }));
    const keynote = buildScoringRubric(profile({ speakingLevel: "KEYNOTE" }));

    // A first-timer's best odds are meetups; for a keynote speaker they are the floor.
    expect(first.slice(0, first.indexOf("65-84"))).toContain("Meetups");
    expect(keynote.slice(0, keynote.indexOf("65-84"))).toContain("flagship industry conferences");
    expect(keynote).toContain("Small conferences and community events");
  });

  it("includes the speaker's target topics", () => {
    expect(buildScoringRubric(profile())).toContain("Sovereign AI, AI literacy for founders");
  });

  it("returns the override verbatim when one is set", () => {
    const out = buildScoringRubric(profile({ rubricOverride: "  Score everything 50.  " }));
    expect(out).toBe("Score everything 50.");
  });

  it("emits all five bands for every level", () => {
    for (const level of ["FIRST_TIME", "OCCASIONAL", "ESTABLISHED", "KEYNOTE"]) {
      const out = buildScoringRubric(profile({ speakingLevel: level }));
      for (const band of ["85-100", "65-84", "40-64", "20-39", "0-19"]) {
        expect(out).toContain(band);
      }
    }
  });
});

describe("buildExclusions", () => {
  it("renders the configured exclusions as bullets", () => {
    const out = buildExclusions(profile());
    expect(out).toContain("STRICT EXCLUSIONS");
    expect(out).toContain("• Cybersecurity conferences");
    expect(out).toContain("• Academic ML research venues");
  });

  it("states plainly that nothing is excluded rather than emitting an empty list", () => {
    const out = buildExclusions(profile({ excludedDomains: "" }));
    expect(out).toContain("No category exclusions");
    expect(out).not.toContain("STRICT EXCLUSIONS");
  });
});

describe("buildFocusThemes", () => {
  it("crosses geographies and topics with the search slices", () => {
    const themes = buildFocusThemes(profile());
    expect(themes).toContain("Amsterdam, NL — AI and technology conferences and summits");
    expect(themes.some((t) => t.startsWith("London, UK —"))).toBe(true);
    expect(themes.some((t) => t.startsWith("Sovereign AI —"))).toBe(true);
  });

  it("always returns at least the generic slices", () => {
    expect(buildFocusThemes(EMPTY_PROFILE).length).toBeGreaterThan(0);
  });

  it("de-duplicates repeated entries", () => {
    const themes = buildFocusThemes(profile({ homeGeographies: "London, UK\nLondon, UK" }));
    expect(new Set(themes).size).toBe(themes.length);
  });
});

describe("rotatingFocusFrom", () => {
  const themes = ["a", "b", "c"];
  const WEEK = 1000 * 60 * 60 * 24 * 7;

  it("returns the same theme within a week and a different one the next", () => {
    const t0 = rotatingFocusFrom(themes, 0);
    expect(rotatingFocusFrom(themes, WEEK - 1)).toBe(t0);
    expect(rotatingFocusFrom(themes, WEEK)).not.toBe(t0);
  });

  it("wraps around the list", () => {
    expect(rotatingFocusFrom(themes, 3 * WEEK)).toBe(rotatingFocusFrom(themes, 0));
  });

  it("returns an empty string for an empty list rather than throwing", () => {
    expect(rotatingFocusFrom([], 0)).toBe("");
  });
});

describe("buildGeographyLine", () => {
  it("lists the configured geographies", () => {
    expect(buildGeographyLine(profile())).toContain("Amsterdam, NL, London, UK");
  });

  it("says there is no preference when none are set", () => {
    expect(buildGeographyLine(EMPTY_PROFILE)).toContain("No geographic preference");
  });
});

describe("isPrivateEvent", () => {
  const keywords = ["digital nomad", "nomad cruise"];

  it("matches a keyword in any searched field, case-insensitively", () => {
    expect(isPrivateEvent({ title: "Digital Nomad Summit" }, keywords)).toBe(true);
    expect(isPrivateEvent({ description: "aboard the NOMAD CRUISE" }, keywords)).toBe(true);
    expect(isPrivateEvent({ industry: "digital nomad lifestyle" }, keywords)).toBe(true);
  });

  it("does not match unrelated events", () => {
    expect(isPrivateEvent({ title: "KubeCon Europe" }, keywords)).toBe(false);
  });

  it("treats keywords as literal substrings, not regex", () => {
    // A stray regex metacharacter must not throw or match everything.
    expect(() => isPrivateEvent({ title: "anything" }, ["("])).not.toThrow();
    expect(isPrivateEvent({ title: "anything" }, ["("])).toBe(false);
  });

  it("is inert when no keywords are configured", () => {
    expect(isPrivateEvent({ title: "Digital Nomad Summit" }, [])).toBe(false);
  });
});

describe("buildSearchPlan", () => {
  it("emits one numbered block per geography and per topic", () => {
    const out = buildSearchPlan(profile(), 2026);
    expect(out).toContain("1. **Amsterdam, NL**");
    expect(out).toContain("2. **London, UK**");
    expect(out).toContain("**Sovereign AI**");
    expect(out).toContain("**AI literacy for founders**");
  });

  it("derives search years from the supplied year instead of hardcoding them", () => {
    const out = buildSearchPlan(profile(), 2030);
    expect(out).toContain("2030 2031 2032");
    expect(out).not.toContain("2026");
  });

  it("always includes the podcast and webinar slices", () => {
    const out = buildSearchPlan(EMPTY_PROFILE, 2026);
    expect(out).toContain("Podcasts and online shows seeking guests");
    expect(out).toContain("Online webinars and virtual summits");
  });

  it("includes an employer block only when an employer angle is set", () => {
    expect(buildSearchPlan(profile(), 2026)).toContain("Employer-relevant events");
    expect(buildSearchPlan(profile({ employerAngle: "" }), 2026)).not.toContain("Employer-relevant events");
  });

  it("numbers blocks contiguously when a geography or topic is missing", () => {
    const out = buildSearchPlan(profile({ homeGeographies: "", signatureTopics: "" }), 2026);
    expect(out).toContain("1. **Podcasts");
    expect(out).toContain("2. **Online webinars");
    expect(out).toContain("3. **Employer-relevant");
  });
});
