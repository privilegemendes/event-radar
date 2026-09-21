/**
 * One-off: set readiness for Nomad Cruise 17 — AI Edition
 * Run: tsx scripts/seed-nomad-readiness.ts
 */
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
dotenv.config();

const db = new PrismaClient();

async function main() {
  const event = await db.event.findFirst({
    where: { title: { contains: "Nomad Cruise" } },
  });

  if (!event) {
    console.error("Nomad Cruise 17 not found in DB");
    process.exit(1);
  }

  const readiness = JSON.stringify({
    speech_ready:     false,  // Sovereign AI talk still to be written
    slides_ready:     false,  // slides not ready yet
    social_announced: true,   // announced the gig on social
    travel_booked:    true,   // Queen Mary 2 crossing booked
    promo_posted:     false,  // pre-event promo post not done yet
    followup_plan:    false,  // post-event plan not in place yet
  });

  await db.event.update({ where: { id: event.id }, data: { readiness } });
  console.log(`✓ Updated readiness for: "${event.title}"`);
  console.log(`  ${readiness}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
