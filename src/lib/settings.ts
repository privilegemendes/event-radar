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

export interface ApplicantProfile {
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
