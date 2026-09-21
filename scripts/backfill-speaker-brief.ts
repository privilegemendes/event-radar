/**
 * One-time backfill: populate the new speaker-brief fields with the values
 * that used to be hardcoded in the prompts.
 *
 * Before this change, discovery/analyze/pitch each carried a literal
 * SPEAKER_PROFILE, scoring rubric, exclusion list and geography list. Those
 * constants are gone; the prompts now render from the stored profile. An
 * existing deployment's profile row predates the new fields, so without this
 * backfill the next discovery run would go out with an empty brief — no
 * topics, no geographies, no exclusions — and quietly return worse results.
 *
 * Only fills fields that are currently blank, so it is safe to re-run and
 * never overwrites anything a human has since edited.
 *
 *   npx tsx scripts/backfill-speaker-brief.ts          # dry run, prints the diff
 *   npx tsx scripts/backfill-speaker-brief.ts --write  # apply
 */
import { PrismaClient } from "@prisma/client";

/**
 * Use the direct (unpooled) connection with generous timeouts. A maintenance
 * script should not take a slot from the app's pooled connections, and a
 * serverless Postgres that has auto-suspended needs time to wake — the default
 * 10s pool timeout fails against a cold Neon compute.
 */
function directUrl(): string {
  const base = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL (or DATABASE_URL_UNPOOLED) is not set");
  const u = new URL(base);
  u.searchParams.set("connect_timeout", "60");
  u.searchParams.set("pool_timeout", "60");
  return u.toString();
}

const db = new PrismaClient({ datasources: { db: { url: directUrl() } } });
const KEY = "applicant_profile";
const WRITE = process.argv.includes("--write");

/** Exactly what the deleted constants said, transposed into brief fields. */
const PREVIOUS_DEFAULTS: Record<string, string> = {
  speakingLevel: "FIRST_TIME",
  signatureTopics: [
    "Sovereign AI",
    "practical AI for non-technical founders and entrepreneurs",
    "AI literacy for individuals",
  ].join("\n"),
  homeGeographies: [
    "Amsterdam, Netherlands",
    "London, UK",
    "Rest of Europe (Belgium, Germany, Luxembourg, Nordics)",
    "Austin, TX",
    "San Francisco Bay Area",
  ].join("\n"),
  credentials:
    "Nomad Cruise 17 AI Edition (Sept 2026, Atlantic crossing, 150 founders & digital nomads aboard Queen Mary 2)",
  employerAngle:
    "EMEA Partner Manager at Coder (coder.com — self-hosted cloud development environments and AI dev infrastructure; $90M Series C led by KKR). Partner events are networking in this role, NOT personal speaking.",
  excludedDomains: [
    "Cybersecurity / infosec / hacking events (Black Hat, DEF CON, RSA, BSides) unless they teach AI to non-technical founders",
    "Single-vertical finance/banking events (Sibos, BAFT, Nacha, GTR)",
    "Telecoms / public-safety / transport trade shows (PMRExpo, NASTD, InnoTrans)",
    "Government procurement / budgeting forums (NASBO, NASACT, NASCIO, ACT-IAC)",
    "Academic / research ML conferences (ICML, NeurIPS, ICLR, ACL, EMNLP, CVPR, ICCV)",
    "Single-vendor enterprise user conferences (Workday Rising, Dreamforce, SAP Sapphire, ServiceNow Knowledge, Oracle CloudWorld)",
    "Utilities, broadcasting, retail and supply-chain trade shows with no AI-for-founders track",
  ].join("\n"),
  privateKeywords: [
    "digital nomad", "nomad cruise", "nomad world", "nomad week", "nomad fest",
    "nomad conference", "nomad summit", "nomad retreat", "nomadic", "remote year",
  ].join("\n"),
  rubricOverride: "",
};

async function main() {
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  if (!row) {
    console.error(`No "${KEY}" row found — save the profile once in Settings first.`);
    process.exit(1);
  }

  const profile = JSON.parse(row.value) as Record<string, string>;
  const filled: string[] = [];
  const skipped: string[] = [];

  for (const [key, value] of Object.entries(PREVIOUS_DEFAULTS)) {
    if (!value) continue;
    if (String(profile[key] ?? "").trim()) { skipped.push(key); continue; }
    profile[key] = value;
    filled.push(key);
  }

  console.log(filled.length ? `Would fill: ${filled.join(", ")}` : "Nothing to fill.");
  if (skipped.length) console.log(`Already set, left alone: ${skipped.join(", ")}`);

  if (!filled.length) return;
  if (!WRITE) {
    console.log("\nDry run — re-run with --write to apply.");
    return;
  }

  await db.appSetting.update({ where: { key: KEY }, data: { value: JSON.stringify(profile) } });
  console.log(`\nWrote ${filled.length} field(s) to ${KEY}.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
