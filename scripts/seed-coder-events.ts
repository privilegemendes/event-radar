/**
 * Inserts Coder-sponsored events from seed/coder-events.json.
 * Run: tsx scripts/seed-coder-events.ts
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config();

const db = new PrismaClient();

interface CoderEventSeed {
  title: string;
  type: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  region?: string;
  description?: string;
  suggestedAction?: string;
}

async function main() {
  const jsonPath = path.join(process.cwd(), "seed", "coder-events.json");
  const events: CoderEventSeed[] = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

  const existing = await db.event.findMany({ select: { title: true } });
  const existingTitles = new Set(existing.map((e) => e.title));

  const SOURCE_NOTE = "Coder sponsored event schedule (Aug 2026)";
  const validActions = ["ATTEND", "APPLY_TO_SPEAK", "BOTH"];
  const validTypes   = ["CONFERENCE", "MEETUP", "EVENT", "PODCAST", "WEBINAR"];

  let inserted = 0;
  let skipped  = 0;

  for (const ev of events) {
    if (existingTitles.has(ev.title)) { skipped++; continue; }
    if (!validTypes.includes(ev.type)) { console.warn(`  ⚠ Unknown type "${ev.type}" for "${ev.title}" — skipping`); continue; }

    const action = ev.suggestedAction && validActions.includes(ev.suggestedAction)
      ? ev.suggestedAction as "ATTEND" | "APPLY_TO_SPEAK" | "BOTH"
      : null;

    await db.event.create({
      data: {
        title:          ev.title,
        type:           ev.type as "CONFERENCE" | "MEETUP" | "EVENT" | "PODCAST" | "WEBINAR",
        startDate:      ev.startDate ? new Date(ev.startDate) : null,
        endDate:        ev.endDate   ? new Date(ev.endDate)   : null,
        location:       ev.location  ?? null,
        region:         ev.region    ?? null,
        description:    ev.description ?? null,
        isOnline:       false,
        coderRelevant:  true,
        isCoderEvent:   true,
        status:         "APPROVED",  // skip inbox — awareness only
        sourceNote:     SOURCE_NOTE,
        suggestedAction: action,
        relevancyScore:  null,       // no scoring needed for Coder's own events
      },
    });

    existingTitles.add(ev.title);
    inserted++;
    console.log(`  ✓ ${ev.startDate ?? "TBD"} | ${ev.type.padEnd(12)} | ${ev.title}`);
  }

  console.log(`\n✅ Done: ${inserted} inserted, ${skipped} skipped (already exist)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
