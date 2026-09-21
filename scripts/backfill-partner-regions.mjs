#!/usr/bin/env node
/**
 * Backfill Partner.region + Partner.tier + vetted status.
 *  - NAMER: the vetted North America partners (table 1) — update category/stage/tier/stageStatus + region=NAMER
 *  - LATAM: table 2 — upsert (create if missing) + region=LATAM
 *  - Everyone else with no region yet -> region=EMEA
 * Idempotent. Reads DATABASE_URL from .env via Prisma.
 *   node scripts/backfill-partner-regions.mjs
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

// name = exact CSV/DB name; label = table label if different
const NAMER = [
  { name: "Trace3", category: "SI/Reseller", stage: "Warm Engagement", tier: "T1", stageStatus: "Need 3-5 deals closed before onboarding Coder as partner" },
  { name: "CDW", category: "Reseller", stage: "Warm Engagement", tier: "T1", stageStatus: "Demo scheduled 9/1/26" },
  { name: "SHI", category: "Reseller", stage: "Nurturing", tier: "T1", stageStatus: "Need $1M Resell Revenue" },
  { name: "Accenture", category: "GSI", stage: "", tier: "T1", stageStatus: "" },
  { name: "Caylent", category: "SI/AWS Premier", stage: "Nurturing", tier: "T1", stageStatus: "" },
  { name: "Thoughtworks", category: "SI", stage: "Warm Engagement", tier: "T1", stageStatus: "" },
  { name: "Kyndryl", category: "GSI", stage: "", tier: "T1", stageStatus: "" },
  { name: "Ahead", category: "SI/Reseller", stage: "Nurturing", tier: "T1", stageStatus: "Need >$1M in Rev" },
  { name: "Deloitte", category: "GSI", stage: "Nurturing", tier: "T1", stageStatus: "" },
  { name: "Technologent", category: "SI", stage: "Nurturing", tier: "T1", stageStatus: "" },
  { name: "Elbit Systems of America", category: "SI/Reseller", stage: "No engagement", tier: "", stageStatus: "" },
  { name: "Cognizant", category: "SI", stage: "No engagement", tier: "T1", stageStatus: "" },
  { name: "EVOTEK", category: "SI/Reseller", stage: "No engagement", tier: "T1", stageStatus: "" },
  { name: "Presidio", category: "SI/Reseller", stage: "No engagement", tier: "T1", stageStatus: "Need >$1M in Rev" },
  { name: "PwC", category: "GSI", stage: "No engagement", tier: "T1", stageStatus: "" },
  { name: "Clearscale", category: "SI/AWS Premier", stage: "No engagement", tier: "T1", stageStatus: "" },
  { name: "TCS", category: "GSI", stage: "Irmak/Simon engaged", tier: "T1", stageStatus: "" },
  { name: "Myriad", category: "SI/Cloud", stage: "Warm Engagement", tier: "T2", stageStatus: "" },
  { name: "Megazone", category: "SI/AWS Premier", stage: "Nurturing", tier: "T2", stageStatus: "" },
  { name: "Liquid PC", category: "Distributor", stage: "Signed", tier: "T2 (T1 Potential)", stageStatus: "GTM Executing" },
  { name: "Next Orbit", category: "SI/AWS Premier", stage: "Signed", tier: "T2", stageStatus: "" },
  { name: "Masterpoint", category: "Boutique SI", stage: "Signed", tier: "T2", stageStatus: "" },
  { name: "Arctiq", category: "SI", stage: "", tier: "T2", stageStatus: "" },
  { name: "Zeb", category: "Boutique SI", stage: "", tier: "T2", stageStatus: "" },
  { name: "River Point Technology", category: "SI", stage: "Nurturing", tier: "T3", stageStatus: "" },
  { name: "EPAM Systems", label: "EPAM", category: "SI", stage: "", tier: "T3", stageStatus: "" },
  { name: "Focus Technology", category: "Boutique SI", stage: "", tier: "T3", stageStatus: "" },
  { name: "Value Momentum", category: "SI", stage: "", tier: "T3", stageStatus: "" },
  { name: "Vivanti", category: "SI", stage: "", tier: "T3", stageStatus: "" },
  { name: "Avahi", category: "SI/AWS Premier", stage: "", tier: "T3", stageStatus: "" },
];

const LATAM = [
  { name: "Stefanini", category: "smaller GSI", stage: "No engagement", tier: "T1", country: "Brazil + broad LATAM", notes: "Industry: Banking, insurance, healthcare, manufacturing. Specialty: Cloud & Infra, cybersecurity, managed services, application modernization, AI/data, automation, digital workplace." },
  { name: "SONDA", category: "Regional SI", stage: "No engagement", tier: "T1", country: "Chile + extensive LATAM", notes: "Industry: Banking, insurance, healthcare, government, utilities, O&G. Specialty: Cloud & data center, cybersecurity, managed infra, workplace applications, digital transformation." },
  { name: "TIVIT", category: "Regional SI", stage: "No engagement", tier: "T1", country: "Brazil + 10 LATAM countries", notes: "Industry: Financial services, utilities, healthcare, O&G. Specialty: Hybrid/multi-cloud, cybersecurity, managed infra, data/AI, digital platforms, application management." },
  { name: "Softtek", category: "smaller GSI", stage: "No engagement", tier: "T1", country: "Mexico + broad LATAM", notes: "Industry: Banking, insurance, healthcare, government, energy. Specialty: App development & modernization, cloud, DevOps, platform engineering, cybersecurity, data/AI, managed services." },
  { name: "Globant", category: "GSI", stage: "No engagement", tier: "T1", country: "Argentina HQ / global", notes: "Industry: Banking and Financial Services. Specialty: Software engineering, cloud, DevOps, AI, digital products, data, application modernization." },
  { name: "CI&T", category: "borderline GSI", stage: "No engagement", tier: "TBD", country: "Brazil / global", notes: "Industry: Financial services and large enterprise. Specialty: Digital engineering, custom software development, cloud modernization, data/AI, product engineering." },
];

let namerUpdated = 0, namerMissing = [];
for (const p of NAMER) {
  const existing = await db.partner.findUnique({ where: { name: p.name } });
  if (!existing) { namerMissing.push(p.label || p.name); continue; }
  await db.partner.update({
    where: { name: p.name },
    data: {
      region: "NAMER",
      tier: p.tier || null,
      category: p.category,
      ...(p.stage ? { stage: p.stage } : {}),
      ...(p.stageStatus ? { stageStatus: p.stageStatus } : {}),
    },
  });
  namerUpdated++;
}

let latamUpserted = 0;
for (const p of LATAM) {
  await db.partner.upsert({
    where: { name: p.name },
    update: { region: "LATAM", tier: p.tier || null, category: p.category, stage: p.stage, country: p.country, notes: p.notes },
    create: { name: p.name, region: "LATAM", tier: p.tier || null, category: p.category, stage: p.stage, stageStatus: "", country: p.country, keyContact: "", notes: p.notes },
  });
  latamUpserted++;
}

// Everyone else with no region yet -> EMEA
const emea = await db.partner.updateMany({ where: { region: null }, data: { region: "EMEA" } });

const byRegion = await db.partner.groupBy({ by: ["region"], _count: true });
console.log(`NAMER updated: ${namerUpdated}${namerMissing.length ? " (missing: " + namerMissing.join(", ") + ")" : ""}`);
console.log(`LATAM upserted: ${latamUpserted}`);
console.log(`EMEA (rest) set: ${emea.count}`);
console.log("Region counts:", byRegion.map((r) => `${r.region}=${r._count}`).join(" | "));
console.log("Total partners:", await db.partner.count());
await db.$disconnect();
