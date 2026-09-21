#!/usr/bin/env node
/**
 * Insert the 95 brand-level partners from seed/partners-95.json.
 * Skips names that already exist (unique constraint -> P2002). Reads DATABASE_URL
 * from .env via Prisma. Safe to re-run.
 *   node scripts/insert-partners-95.mjs
 */
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const partners = JSON.parse(
  await readFile(new URL("../seed/partners-95.json", import.meta.url), "utf8")
);

let created = 0, existed = 0, failed = 0;
for (const p of partners) {
  try {
    await db.partner.create({
      data: { name: p.name, category: p.category, stage: "", stageStatus: "", country: "", keyContact: "", notes: "" },
    });
    created++; console.log("+ ", p.name);
  } catch (e) {
    if (e.code === "P2002") { existed++; console.log("•  exists:", p.name); }
    else { failed++; console.log("x ", p.name, e.code || e.message); }
  }
}
console.log(`\nDone: ${created} created, ${existed} already existed, ${failed} failed (of ${partners.length}).`);
await db.$disconnect();
