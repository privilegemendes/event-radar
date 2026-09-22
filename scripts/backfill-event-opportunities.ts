/**
 * Phase 1 backfill: give the owner an EventOpportunity row for every event,
 * carrying the per-speaker values that currently live on Event.
 *
 * Those columns — score, track, pipeline status, readiness, pitch draft — are
 * one speaker's opinion stored on a shared row. This copies them onto rows that
 * belong to a person, so a second speaker can hold their own without
 * overwriting the first.
 *
 * Nothing reads EventOpportunity yet; the Event columns stay authoritative
 * until Phase 2. Until then a write through the app updates Event and not the
 * copy, so re-run this immediately before Phase 2 if time has passed.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-event-opportunities.ts          # dry run
 *   npx tsx --env-file=.env.local scripts/backfill-event-opportunities.ts --write  # apply
 *
 * Idempotent: skips events the owner already has a row for, so re-running
 * only fills gaps. Pass --refresh to also overwrite existing rows from Event.
 */
import { PrismaClient } from "@prisma/client";
import { opportunityFromEvent } from "../src/lib/opportunity";

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
const REFRESH = process.argv.includes("--refresh");
const OWNER = (process.env.OWNER_EMAIL ?? "irmak@coder.com").toLowerCase();
const BATCH = 200;

async function main() {
  console.log(`target:  ${new URL(directUrl()).host}`);
  console.log(`owner:   ${OWNER}\n`);

  const owner = await db.user.findUnique({ where: { email: OWNER }, select: { id: true } });
  if (!owner) throw new Error(`No user with email ${OWNER} — set OWNER_EMAIL or create the user first.`);

  const totalEvents = await db.event.count();
  const existing = await db.eventOpportunity.count({ where: { userId: owner.id } });
  const todo = REFRESH ? totalEvents : totalEvents - existing;

  console.log(`events:              ${totalEvents}`);
  console.log(`owner already has:   ${existing}`);
  console.log(`${REFRESH ? "to refresh" : "to create"}:          ${todo}\n`);

  if (todo <= 0) { console.log("Nothing to do."); return; }
  if (!WRITE) { console.log("Dry run — re-run with --write to apply."); return; }

  let done = 0;
  for (let skip = 0; ; skip += BATCH) {
    const events = await db.event.findMany({
      skip, take: BATCH, orderBy: { id: "asc" },
      select: {
        id: true, relevancyScore: true, relevancyRationale: true, acceptanceLikelihood: true,
        acceptanceRationale: true, suggestedAction: true, category: true, coderRelevant: true,
        status: true, pitchDraft: true, followUpAt: true, attending: true, readiness: true,
        prepStage: true, customTasks: true, ownerOnly: true,
      },
    });
    if (!events.length) break;

    for (const e of events) {
      const data = { ...opportunityFromEvent(e), updatedAt: new Date() };
      if (REFRESH) {
        await db.eventOpportunity.upsert({
          where: { userId_eventId: { userId: owner.id, eventId: e.id } },
          create: { userId: owner.id, eventId: e.id, ...data },
          update: data,
        });
      } else {
        // createMany-style skip, but per row so the unique constraint does the work.
        await db.eventOpportunity.createMany({
          data: [{ userId: owner.id, eventId: e.id, ...data }],
          skipDuplicates: true,
        });
      }
      done++;
    }
    console.log(`  ${done}/${totalEvents}`);
  }

  const final = await db.eventOpportunity.count({ where: { userId: owner.id } });
  console.log(`\nDone. Owner now has ${final} opportunity row(s) for ${totalEvents} event(s).`);
  console.log("Event columns remain authoritative — nothing reads this table until Phase 2.");
}

main().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); })
      .finally(() => db.$disconnect());
