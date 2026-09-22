import { EMPTY_PROFILE, profileFromRow, SPEAKING_LEVELS } from "./profile-schema";

describe("profileFromRow", () => {
  it("carries every known string field across", () => {
    const row = { ...EMPTY_PROFILE, fullName: "Ada Lovelace", speakingLevel: "KEYNOTE" };
    const p = profileFromRow(row);
    expect(p.fullName).toBe("Ada Lovelace");
    expect(p.speakingLevel).toBe("KEYNOTE");
  });

  it("returns a fully-populated empty profile for a missing row", () => {
    const p = profileFromRow(null);
    expect(p).toEqual(EMPTY_PROFILE);
    // Every key present and a string — a missing key would render as the
    // literal "undefined" inside a prompt.
    for (const k of Object.keys(EMPTY_PROFILE)) {
      expect(typeof p[k as keyof typeof p]).toBe("string");
    }
  });

  it("drops columns that are not part of the profile", () => {
    const p = profileFromRow({ ...EMPTY_PROFILE, id: "abc", userId: "u1", legacyField: "junk" });
    expect(p).not.toHaveProperty("id");
    expect(p).not.toHaveProperty("userId");
    expect(p).not.toHaveProperty("legacyField");
    expect(Object.keys(p).sort()).toEqual(Object.keys(EMPTY_PROFILE).sort());
  });

  it("falls back to empty string for a non-string column", () => {
    // Prisma would return a Date/null for some columns; those must not reach a prompt.
    const p = profileFromRow({ fullName: null, jobTitle: 42, company: new Date() });
    expect(p.fullName).toBe("");
    expect(p.jobTitle).toBe("");
    expect(p.company).toBe("");
  });

  it("keeps multi-line values intact", () => {
    const p = profileFromRow({ homeGeographies: "Amsterdam, NL\nLondon, UK" });
    expect(p.homeGeographies.split("\n")).toEqual(["Amsterdam, NL", "London, UK"]);
  });
});

describe("EMPTY_PROFILE", () => {
  it("has a defined string for every field, so a blank profile is still renderable", () => {
    for (const [k, v] of Object.entries(EMPTY_PROFILE)) {
      expect(typeof v).toBe("string");
      expect(k).not.toMatch(/undefined/);
    }
  });

  it("covers every speaking level the rubric branches on", () => {
    expect(SPEAKING_LEVELS).toEqual(["FIRST_TIME", "OCCASIONAL", "ESTABLISHED", "KEYNOTE"]);
  });
});
