/**
 * One-time cleanup: deletes events that are irrelevant to Irmak's speaker profile.
 * Rules (both must hold to delete):
 *   - relevancyScore < 30
 *   - no linked partner (partnerId IS NULL)
 * These are narrow-vertical, cybersecurity, gov-sector, or finance-only events
 * that will never be speaking opportunities for her.
 * Run: tsx scripts/cleanup-events.ts
 */
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
dotenv.config();

const db = new PrismaClient();

async function main() {
  // Preview first
  const toDelete = await db.event.findMany({
    where: {
      AND: [
        { relevancyScore: { lt: 30 } },
        { partnerId: null },
      ],
    },
    select: { id: true, title: true, relevancyScore: true, industry: true },
    orderBy: { relevancyScore: "asc" },
  });

  if (toDelete.length === 0) {
    console.log("Nothing to delete — all events meet the threshold.");
    return;
  }

  console.log(`\nWill DELETE ${toDelete.length} off-focus events:\n`);
  for (const ev of toDelete) {
    console.log(`  [${String(ev.relevancyScore ?? "??").padStart(3)}] ${ev.title}`);
  }

  const ids = toDelete.map((e) => e.id);
  const { count } = await db.event.deleteMany({ where: { id: { in: ids } } });
  console.log(`\n✓ Deleted ${count} events.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
