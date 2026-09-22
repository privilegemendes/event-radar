import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as fs from "fs";
import * as path from "path";

const db = new PrismaClient();

interface PartnerSeed {
  name: string;
  category: string;
  stage: string;
  stageStatus: string;
  country: string;
  keyContact: string;
  notes: string;
}

async function main() {
  console.log("🌱 Seeding database…");

  // Seed users
  const hash = await bcrypt.hash("change-me-now", 12);

  const users = [
    { email: "irmak@coder.com", name: "Irmak Eyiceoglu", role: "ADMIN" as const },
    { email: "assistant@example.com", name: "Assistant", role: "ADMIN" as const },
    { email: "viewer@coder.com", name: "Viewer", role: "MEMBER" as const },
  ];

  for (const u of users) {
    await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        passwordHash: hash,
        role: u.role,
        mustChangePassword: true,
      },
    });
    console.log(`  ✓ User: ${u.email}`);
  }

  // Seed partners from JSON
  const jsonPath = path.join(process.cwd(), "seed", "partners.json");
  const partners: PartnerSeed[] = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

  let partnerCount = 0;
  for (const p of partners) {
    const existing = await db.partner.findUnique({ where: { name: p.name } });
    if (!existing) {
      await db.partner.create({
        data: {
          name: p.name,
          category: p.category,
          stage: p.stage,
          stageStatus: p.stageStatus,
          country: p.country,
          keyContact: p.keyContact,
          notes: p.notes,
        },
      });
      partnerCount++;
    }
  }
  console.log(`  ✓ Partners: ${partnerCount} created (${partners.length - partnerCount} skipped as duplicates)`);

  // Find Deloitte for event seed
  const deloitte = await db.partner.findUnique({ where: { name: "Deloitte" } });

  // Seed example events
  const existingEvents = await db.event.findMany({ select: { title: true } });
  const existingTitles = new Set(existingEvents.map((e) => e.title));

  const exampleEvents = [
    {
      title: "AI in Enterprise Amsterdam 2026",
      type: "CONFERENCE" as const,
      startDate: new Date("2026-03-15"),
      endDate: new Date("2026-03-16"),
      location: "Amsterdam, Netherlands",
      isOnline: false,
      region: "Amsterdam/NL",
      coderRelevant: true,
      status: "APPROVED" as const,
      cfpDeadline: new Date("2025-12-01"),
      url: "https://example.com/ai-amsterdam-2026",
      contact: "cfp@ai-amsterdam.example.com",
      description: "Annual enterprise AI conference in Amsterdam bringing together CIOs, platform engineers, and AI practitioners from across Europe.",
      sourceNote: "Manually added — Deloitte is a co-sponsor",
      partnerId: deloitte?.id ?? null,
    },
    {
      title: "The AI Founders Podcast",
      type: "PODCAST" as const,
      startDate: null,
      endDate: null,
      location: null,
      isOnline: true,
      region: "Online",
      coderRelevant: false,
      status: "DISCOVERED" as const,
      cfpDeadline: null,
      url: "https://example.com/ai-founders-podcast",
      contact: "hello@aifounders.example.com",
      description: "Weekly podcast exploring how non-technical founders are leveraging AI tools and Sovereign AI principles to build products and scale businesses.",
      sourceNote: "Auto-discovery run — online AI podcast seeking guests",
    },
    {
      title: "Nomad Cruise 17 — AI Edition",
      type: "EVENT" as const,
      startDate: new Date("2026-09-19"),
      endDate: new Date("2026-09-26"),
      location: "Southampton → New York (Queen Mary 2)",
      isOnline: false,
      region: "Other",
      coderRelevant: false,
      status: "ACCEPTED" as const,
      cfpDeadline: null,
      url: "https://nomadcruise.com",
      contact: null,
      description: "Nomad Cruise 17 AI Edition — an Atlantic crossing from Southampton to New York aboard the Queen Mary 2 (Sept 19–26, 2026). Irmak will deliver a talk on practical AI for non-technical startup owners to 150 founders and digital nomads.",
      sourceNote: "Manually added — confirmed speaker slot",
    },
  ];

  let eventCount = 0;
  for (const ev of exampleEvents) {
    if (!existingTitles.has(ev.title)) {
      await db.event.create({ data: ev });
      eventCount++;
    }
  }
  console.log(`  ✓ Events: ${eventCount} created`);

  console.log("✅ Seeding complete");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
