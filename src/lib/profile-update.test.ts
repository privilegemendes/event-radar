import { mergeProfileUpdate, PROFILE_FIELDS } from "./profile-update";
import { EMPTY_PROFILE, type ApplicantProfile } from "./profile-schema";

const filled = (over: Partial<ApplicantProfile> = {}): ApplicantProfile => ({
  ...EMPTY_PROFILE,
  fullName: "Irmak Eyiceoglu",
  jobTitle: "EMEA Partner Manager",
  company: "Coder",
  email: "irmak@example.com",
  bioShort: "A short bio.",
  talkTopics: "Sovereign AI",
  ...over,
});

describe("mergeProfileUpdate", () => {
  /* The regression this exists for. The PUT route replaces; a partial change
     through that shape would erase every field the caller did not mention. */
  it("keeps fields the update does not mention", () => {
    const out = mergeProfileUpdate(filled(), { linkedin: "https://linkedin.com/in/x" });
    expect(out.linkedin).toBe("https://linkedin.com/in/x");
    expect(out.fullName).toBe("Irmak Eyiceoglu");
    expect(out.company).toBe("Coder");
    expect(out.bioShort).toBe("A short bio.");
  });

  it("changes only what was named, across many fields", () => {
    const before = filled();
    const out = mergeProfileUpdate(before, { jobTitle: "Partner Lead" });
    const changed = PROFILE_FIELDS.filter((k) => out[k] !== before[k]);
    expect(changed).toEqual(["jobTitle"]);
  });

  it("allows clearing a field deliberately with an empty string", () => {
    expect(mergeProfileUpdate(filled(), { company: "" }).company).toBe("");
  });

  it("ignores a non-string rather than storing one", () => {
    const out = mergeProfileUpdate(filled(), { fullName: 42 as unknown as string });
    expect(out.fullName).toBe("Irmak Eyiceoglu");
  });

  it("ignores unknown keys entirely", () => {
    const out = mergeProfileUpdate(filled(), { role: "ADMIN", id: "x" });
    expect(out).not.toHaveProperty("role");
    expect(out).not.toHaveProperty("id");
  });

  it("fills absent keys from EMPTY_PROFILE so the shape is always complete", () => {
    const partialCurrent = { fullName: "Someone" } as ApplicantProfile;
    const out = mergeProfileUpdate(partialCurrent, {});
    for (const k of PROFILE_FIELDS) expect(typeof out[k]).toBe("string");
  });

  it("an empty update is a no-op", () => {
    const before = filled();
    expect(mergeProfileUpdate(before, {})).toEqual({ ...EMPTY_PROFILE, ...before });
  });
});
