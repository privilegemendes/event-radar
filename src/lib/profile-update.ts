import { EMPTY_PROFILE, type ApplicantProfile } from "@/lib/profile-schema";

/**
 * Apply a PARTIAL change to a profile, keeping everything not mentioned.
 *
 * PUT /api/settings/profile deliberately REPLACES: it rebuilds from
 * EMPTY_PROFILE and blanks any key the body omits, which is right for a form
 * that submits every field at once. It is the wrong shape for a caller
 * changing one thing — updating `linkedin` alone through that route would
 * erase the name, bio and topics.
 *
 * So a conversational update merges instead. Two genuinely different
 * operations rather than drift; what they share is this file's rule about
 * which keys exist at all.
 *
 * Pure, so the merge can be tested without a database — the wipe it exists to
 * prevent is silent and would otherwise only surface as a profile that has
 * quietly emptied.
 */
export function mergeProfileUpdate(
  current: ApplicantProfile,
  partial: Record<string, unknown>,
): ApplicantProfile {
  const next = { ...EMPTY_PROFILE, ...current };

  for (const key of Object.keys(EMPTY_PROFILE) as (keyof ApplicantProfile)[]) {
    if (!(key in partial)) continue;            // absent: keep what is there
    const v = partial[key];
    if (typeof v !== "string") continue;        // ignore a non-string rather than store one
    next[key] = v;                              // present, including "" to clear deliberately
  }

  return next;
}

/** The fields a caller may set, so a tool can name them without guessing. */
export const PROFILE_FIELDS = Object.keys(EMPTY_PROFILE) as (keyof ApplicantProfile)[];
