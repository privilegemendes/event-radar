/**
 * Copy the production database into a LOCAL one, through Prisma.
 *
 * Written because `pg_dump` stalls against this Neon endpoint, and because
 * passing a connection URL on a command line puts the password in the process
 * list for every other process to read. Prisma takes the URL in code instead.
 *
 * scripts/export-data.mjs is NOT a restore path — it flattens relations and
 * truncates dates for human reading. This preserves ids, relations and types.
 *
 *   SOURCE_DATABASE_URL=... npx tsx scripts/copy-prod-to-local.ts          # dry run
 *   SOURCE_DATABASE_URL=... npx tsx scripts/copy-prod-to-local.ts --write  # apply
 *
 * The destination is DATABASE_URL from .env, which in this worktree is local.
 *
 * ⚠️ WHAT THIS COPIES: real speaker personal data (names, employers, LinkedIn
 * URLs, AI-written outreach notes about third parties), the partner CRM with
 * named contacts and deal stages, password hashes, and AppSetting — which holds
 * the calendar ICS URL, a secret. It is a production copy on your disk. Delete
 * the local database when you are done with it.
 */
import { PrismaClient } from "@prisma/client";

function normalise(raw: string | undefined, label: string): string {
  const v = (raw ?? "").replace(/^"|"$/g, "");
  if (!v) throw new Error(`${label} is not set`);
  const u = new URL(v);
  u.searchParams.set("connect_timeout", "60");
  u.searchParams.set("pool_timeout", "60");
  return u.toString();
}

const sourceUrl = normalise(process.env.SOURCE_DATABASE_URL, "SOURCE_DATABASE_URL");
const destUrl = normalise(process.env.DATABASE_URL, "DATABASE_URL");

/* Hard guard. This script truncates the destination, so it must be impossible
   to point it at anything but a local database — a mistyped variable should
   fail loudly rather than wipe production. */
const destHost = new URL(destUrl).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(destHost)) {
  console.error(`REFUSING TO RUN: destination host is "${destHost}", not localhost.`);
  console.error("This script truncates the destination. It only ever writes to a local database.");
  process.exit(1);
}
if (new URL(sourceUrl).hostname === destHost) {
  console.error("REFUSING TO RUN: source and destination are the same database.");
  process.exit(1);
}

const src = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
const dst = new PrismaClient({ datasources: { db: { url: destUrl } } });
const WRITE = process.argv.includes("--write");

/* Insert order respects foreign keys; delete order is its reverse.
   `session` and `verification` are skipped — ephemeral, and copying live
   sessions into another database is pointless and slightly unpleasant. */
const TABLES = [
  "Partner", "Event", "Speaker", "AppSetting", "DiscoveryRun",
  "User", "account", "SpeakerProfile", "EventOpportunity",
] as const;

type Client = PrismaClient & Record<string, { findMany: (a?: object) => Promise<unknown[]>; createMany: (a: object) => Promise<{ count: number }>; deleteMany: (a?: object) => Promise<{ count: number }>; count: () => Promise<number> }>;

const model: Record<string, string> = {
  Partner: "partner", Event: "event", Speaker: "speaker", AppSetting: "appSetting",
  DiscoveryRun: "discoveryRun", User: "user", account: "account",
  SpeakerProfile: "speakerProfile", EventOpportunity: "eventOpportunity",
};

async function main() {
  console.log(`source: ${new URL(sourceUrl).hostname}`);
  console.log(`dest:   ${destHost} (${new URL(destUrl).pathname.slice(1)})\n`);

  const plan: { table: string; rows: number }[] = [];
  for (const t of TABLES) {
    const m = model[t];
    if (!(m in src)) { console.log(`  skip ${t} — not in this schema`); continue; }
    plan.push({ table: t, rows: await (src as Client)[m].count() });
  }
  for (const p of plan) console.log(`  ${p.table.padEnd(18)} ${String(p.rows).padStart(5)} rows`);

  if (!WRITE) { console.log("\nDry run — re-run with --write to copy."); return; }

  console.log("\nclearing destination…");
  for (const t of [...TABLES].reverse()) {
    const m = model[t];
    if (!(m in dst)) continue;
    const { count } = await (dst as Client)[m].deleteMany({});
    if (count) console.log(`  cleared ${count} from ${t}`);
  }

  console.log("\ncopying…");
  for (const p of plan) {
    const m = model[p.table];
    const rows = await (src as Client)[m].findMany({});
    if (!rows.length) { console.log(`  ${p.table.padEnd(18)} 0`); continue; }
    // Chunked: a single createMany of 1,300+ rows can exceed parameter limits.
    let done = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const { count } = await (dst as Client)[m].createMany({ data: rows.slice(i, i + 200) });
      done += count;
    }
    console.log(`  ${p.table.padEnd(18)} ${done}`);
  }

  console.log("\nverifying row counts…");
  let bad = 0;
  for (const p of plan) {
    const m = model[p.table];
    const after = await (dst as Client)[m].count();
    const ok = after === p.rows;
    if (!ok) bad++;
    console.log(`  ${ok ? "ok  " : "MISMATCH"} ${p.table.padEnd(18)} source ${p.rows} / dest ${after}`);
  }
  console.log(bad ? `\n${bad} table(s) did not match.` : "\nAll tables match.");
}

main().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); })
      .finally(async () => { await src.$disconnect(); await dst.$disconnect(); });
