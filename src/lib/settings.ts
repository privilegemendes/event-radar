import "server-only";
import { db } from "./db";

/**
 * Simple key/value settings store backed by the AppSetting table.
 * Used for the single-user Applicant Profile and the (secret) calendar ICS URL.
 */

export const SETTINGS_KEYS = {
  applicantProfile: "applicant_profile",
  calendarIcsUrl: "calendar_ics_url",
  autoDiscovery: "auto_discovery_enabled",
} as const;

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

export async function getSetting(key: string): Promise<string | null> {
  const row = await db.appSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function getApplicantProfile(): Promise<ApplicantProfile> {
  const raw = await getSetting(SETTINGS_KEYS.applicantProfile);
  if (!raw) return { ...EMPTY_PROFILE };
  try {
    return { ...EMPTY_PROFILE, ...(JSON.parse(raw) as Partial<ApplicantProfile>) };
  } catch {
    return { ...EMPTY_PROFILE };
  }
}

/**
 * The calendar ICS URL is a secret (grants read access to the whole calendar),
 * so prefer an env var in production and never expose the raw value to clients.
 */
export async function getCalendarIcsUrl(): Promise<string | null> {
  return process.env.WORK_CALENDAR_ICS_URL || (await getSetting(SETTINGS_KEYS.calendarIcsUrl));
}

/** Automatic discovery is ON unless explicitly turned off. */
export async function isAutoDiscoveryEnabled(): Promise<boolean> {
  const v = await getSetting(SETTINGS_KEYS.autoDiscovery);
  return v !== "false";
}

/** Mask a secret URL for display: keep scheme+host, hide the token/path. */
export function maskUrl(url: string | null): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/…(hidden)`;
  } catch {
    return "…(set)";
  }
}
