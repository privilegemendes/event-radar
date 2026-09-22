/**
 * The profile's shape and its client-safe constants.
 *
 * Deliberately free of `server-only` and of any database import: the settings
 * form is a Client Component and needs SPEAKING_LEVELS at runtime, and the
 * prompt builders are unit-tested without a database. settings.ts re-exports
 * everything here, so server-side importers are unaffected.
 */

/** Speaking track record — selects which scoring rubric the AI is given. */
export const SPEAKING_LEVELS = ["FIRST_TIME", "OCCASIONAL", "ESTABLISHED", "KEYNOTE"] as const;
export type SpeakingLevel = (typeof SPEAKING_LEVELS)[number];

export const SPEAKING_LEVEL_LABELS: Record<SpeakingLevel, string> = {
  FIRST_TIME:  "First-time — building a track record",
  OCCASIONAL:  "Occasional — a handful of talks given",
  ESTABLISHED: "Established — speaks regularly",
  KEYNOTE:     "Keynote — headline speaker",
};

/**
 * The single-user profile. Two halves:
 *
 *  1. Applicant fields (fullName … pronouns) — used to fill in CFP forms and
 *     the Apply modal. Cosmetic: they describe the person to an event organiser.
 *  2. Speaker-brief fields (speakingLevel … rubricOverride) — fed to the LLM to
 *     steer discovery, scoring, pitches and outreach. Behavioural: they decide
 *     what gets found and how it is ranked.
 *
 * Every field is a string so the settings PUT route can persist new keys with
 * no per-field handling (it coerces by iterating EMPTY_PROFILE).
 */
export interface ApplicantProfile {
  /* ── Applicant fields (fill in application forms) ── */
  fullName: string;
  jobTitle: string;
  company: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  twitter: string;
  website: string;
  headshotUrl: string;
  bioShort: string;
  bioLong: string;
  talkTopics: string;
  dietary: string;
  pronouns: string;

  /* ── Speaker brief (steers AI discovery, scoring & pitches) ── */
  /** One of SPEAKING_LEVELS. Empty falls back to FIRST_TIME. */
  speakingLevel: string;
  /** Topics to search and score against, one per line. */
  signatureTopics: string;
  /** Priority locations, one per line (e.g. "Amsterdam, NL"). */
  homeGeographies: string;
  /** Speaking credentials to cite in pitches, one per line. */
  credentials: string;
  /** How the employer is positioned in pitches. Empty = no employer angle. */
  employerAngle: string;
  /** Event kinds to exclude from discovery, one per line. */
  excludedDomains: string;
  /** Keywords marking an event private to the owner, one per line. */
  privateKeywords: string;
  /** Replaces the generated scoring rubric wholesale when set. */
  rubricOverride: string;
}

export const EMPTY_PROFILE: ApplicantProfile = {
  fullName: "",
  jobTitle: "",
  company: "",
  email: "",
  phone: "",
  location: "",
  linkedin: "",
  twitter: "",
  website: "",
  headshotUrl: "",
  bioShort: "",
  bioLong: "",
  talkTopics: "",
  dietary: "",
  pronouns: "",
  speakingLevel: "",
  signatureTopics: "",
  homeGeographies: "",
  credentials: "",
  employerAngle: "",
  excludedDomains: "",
  privateKeywords: "",
  rubricOverride: "",
};

/**
 * Project a SpeakerProfile database row onto the ApplicantProfile shape.
 *
 * Whitelists by the known keys rather than spreading the row, so a column added
 * to the table but not to this interface cannot leak into the prompts — and a
 * missing or non-string column falls back to "" instead of undefined, which
 * would render as the literal "undefined" in a prompt.
 *
 * Pure, and free of the server-only/Prisma imports in settings.ts, so it can be
 * unit-tested.
 */
export function profileFromRow(row: Record<string, unknown> | null | undefined): ApplicantProfile {
  const out = { ...EMPTY_PROFILE };
  if (!row) return out;
  for (const key of Object.keys(EMPTY_PROFILE) as (keyof ApplicantProfile)[]) {
    const v = row[key];
    if (typeof v === "string") out[key] = v;
  }
  return out;
}
