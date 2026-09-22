import "server-only";
import { db } from "./db";
import { EMPTY_PROFILE, profileFromRow, type ApplicantProfile } from "./profile-schema";
import { OWNER_EMAIL } from "./owner";

export * from "./profile-schema";

/**
 * Key/value settings store backed by the AppSetting table.
 *
 * Still holds the calendar ICS URL and the auto-discovery toggle. The speaker
 * brief moved out to its own table — see getApplicantProfile below.
 */

export const SETTINGS_KEYS = {
  applicantProfile: "applicant_profile",
  calendarIcsUrl: "calendar_ics_url",
  autoDiscovery: "auto_discovery_enabled",
} as const;

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

/**
 * Read the speaker brief.
 *
 * Phase 0 of the per-speaker split: storage moved from a single JSON blob in
 * AppSetting to the SpeakerProfile table, keyed by user. Behaviour is
 * deliberately unchanged — with no argument this still resolves the OWNER's
 * profile, which is the only one that exists today, so every existing caller
 * keeps working without being touched.
 *
 * Phase 2 is what makes callers pass the session user; until then `userId` is
 * an opt-in used only by tests and the backfill.
 */
export async function getApplicantProfile(userId?: string): Promise<ApplicantProfile> {
  const row = userId
    ? await db.speakerProfile.findUnique({ where: { userId } })
    : await db.speakerProfile.findFirst({ where: { user: { email: OWNER_EMAIL } } });

  return profileFromRow(row as unknown as Record<string, unknown> | null);
}

/**
 * Write the speaker brief. Creates the row on first save.
 *
 * As above, no userId means the owner — the single speaker that exists today.
 */
export async function setApplicantProfile(
  profile: ApplicantProfile,
  userId?: string,
): Promise<ApplicantProfile> {
  const targetId =
    userId ??
    (await db.user.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } }))?.id;

  if (!targetId) {
    throw new Error(
      `No user to attach the speaker profile to (looked for OWNER_EMAIL=${OWNER_EMAIL}).`,
    );
  }

  const data: Record<string, string> = {};
  for (const key of Object.keys(EMPTY_PROFILE) as (keyof ApplicantProfile)[]) {
    data[key] = typeof profile[key] === "string" ? profile[key] : "";
  }

  await db.speakerProfile.upsert({
    where: { userId: targetId },
    create: { userId: targetId, ...data },
    update: data,
  });

  return getApplicantProfile(targetId);
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
