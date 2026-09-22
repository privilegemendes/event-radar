/**
 * One-time: move the speaker brief out of AppSetting["applicant_profile"] into
 * the SpeakerProfile table, attached to OWNER_EMAIL.
 *
 * Phase 0 of the per-speaker split. Until this runs, the brief still lives in
 * the JSON blob and the app reads an empty profile from the new table — which
 * would send discovery out with no topics, geographies or exclusions.
 *
 * The AppSetting row is left in place as the rollback path; a later change can
 * delete it once this has been exercised.
 *
 *   npx tsx --env-file=.env.local scripts/migrate-profile-to-table.ts          # dry run
 *   npx tsx --env-file=.env.local scripts/migrate-profile-to-table.ts --write  # apply
 */
import { PrismaClient } from "@prisma/client";
import { EMPTY_PROFILE, type ApplicantProfile } from "../src/lib/profile-schema";

function directUrl(): string {
  const base = (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "").replace(/^"|"$/g, "");
  if (!base) throw new Error("DATABASE_URL (or DATABASE_URL_UNPOOLED) is not set");
  const u = new URL(base);
  u.searchParams.set("connect_timeout", "60");
  u.searchParams.set("pool_timeout", "60");
  return u.toString();
}

const db = new PrismaClient({ datasources: { db: { url: directUrl() } } });
const WRITE = process.argv.includes("--write");
const OWNER = (process.env.OWNER_EMAIL ?? "irmak@coder.com").toLowerCase();

async function main() {
  console.log(`target database: ${new URL(directUrl()).host}`);
  console.log(`owner:           ${OWNER}\n`);

  const owner = await db.user.findUnique({ where: { email: OWNER }, select: { id: true } });
  if (!owner) throw new Error(`No user with email ${OWNER} — set OWNER_EMAIL or create the user first.`);

  const existing = await db.speakerProfile.findUnique({ where: { userId: owner.id }, select: { id: true } });
  if (existing) { console.log("Owner already has a SpeakerProfile — nothing to do."); return; }

  const row = await db.appSetting.findUnique({ where: { key: "applicant_profile" } });
  if (!row) { console.log('No AppSetting["applicant_profile"] — nothing to migrate.'); return; }

  let parsed: Partial<ApplicantProfile>;
  try {
    parsed = JSON.parse(row.value) as Partial<ApplicantProfile>;
  } catch {
    throw new Error("applicant_profile is not valid JSON — refusing to guess at it.");
  }

  const data = { ...EMPTY_PROFILE };
  const carried: string[] = [];
  for (const key of Object.keys(EMPTY_PROFILE) as (keyof ApplicantProfile)[]) {
    const v = parsed[key];
    if (typeof v === "string" && v.trim()) { data[key] = v; carried.push(key); }
  }

  console.log(`fields carried over (${carried.length}): ${carried.join(", ") || "(none)"}`);
  const dropped = Object.keys(parsed).filter((k) => !(k in EMPTY_PROFILE));
  if (dropped.length) console.log(`fields in the blob but not in the schema, DROPPED: ${dropped.join(", ")}`);

  if (!WRITE) { console.log("\nDry run — re-run with --write to apply."); return; }

  await db.speakerProfile.create({ data: { userId: owner.id, ...data } });
  console.log(`\nCreated SpeakerProfile for ${OWNER}. AppSetting row left in place as rollback.`);
}

main().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); })
      .finally(() => db.$disconnect());
