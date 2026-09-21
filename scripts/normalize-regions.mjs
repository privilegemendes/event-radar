/**
 * SUPERSEDED — DO NOT RUN. Kept for reference only.
 *
 * This predates the split of location into two columns. Event.region now holds a
 * MACRO region (the REGIONS list in src/lib/constants.ts: North America, UK,
 * Europe, Middle East, Africa, Asia Pacific, Online, Other) and Event.city holds
 * the specific place. Both are produced by deriveGeo() in src/lib/events.ts,
 * which is the current implementation; scripts/backfill-geo.mjs is its backfill.
 *
 * The canonicalRegion() below writes the OLD single-field vocabulary
 * ("Amsterdam/NL", "Rest of Europe", "London/UK", "Austin", "Bay Area"). Running
 * it rolls the data backwards: measured against live data it rewrites 979 of 1233
 * rows, breaks the region filters on the dashboard, map, inbox and partners pages
 * (which all read the macro list), and collapses every Asia Pacific, Middle East
 * and Africa event into "Other", losing that geography entirely.
 *
 * APPLY=1 is therefore blocked. Override only if you have a database backup and
 * genuinely intend the rollback.
 */
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const APPLY = process.env.APPLY === "1";

if (APPLY && process.env.I_UNDERSTAND_THIS_IS_SUPERSEDED !== "1") {
  console.error("Refusing to run: this script is superseded and would roll ~979 rows back to the");
  console.error("pre-city region vocabulary. See the comment at the top of this file.");
  console.error("Current implementation: deriveGeo() in src/lib/events.ts (backfill-geo.mjs).");
  process.exit(1);
}

function canonicalRegion({ location, region, title, isOnline, type }) {
  const hay = ` ${location ?? ""} ${region ?? ""} ${title ?? ""} `.toLowerCase();
  const has = (...ws) => ws.some((w) => hay.includes(w));
  const rx = (re) => re.test(hay);
  if (has("amsterdam", "netherlands", "the hague", "rotterdam", "utrecht", "eindhoven")) return "Amsterdam/NL";
  if (has("london", "united kingdom", "england", "scotland", "manchester", "edinburgh", "birmingham", "bristol", "glasgow", "leeds") || rx(/\buk\b/)) return "London/UK";
  if (has("austin", "sxsw") || rx(/\btexas\b/) || rx(/\btx\b/)) return "Austin";
  if (has("san francisco", "santa clara", "san jose", "oakland", "palo alto", "mountain view", "silicon valley", "bay area", "sunnyvale", "berkeley", "menlo park", "cupertino", "redwood city", "south san francisco") || rx(/\bsf\b/)) return "Bay Area";
  if (has("brussels","belgium","germany","berlin","munich","cologne","frankfurt","hamburg","luxembourg","paris","france","stockholm","sweden","copenhagen","denmark","helsinki","finland","oslo","norway","zurich","geneva","switzerland","vienna","austria","italy","milan","rome","spain","madrid","barcelona","portugal","lisbon","ireland","dublin","prague","czech","krakow","warsaw","poland","vilnius","lithuania","malta","greece","athens","europe")) return "Rest of Europe";
  if (isOnline || type === "PODCAST" || type === "WEBINAR") return "Online";
  return "Other";
}

const evs = await db.event.findMany({ select: { id: true, title: true, location: true, region: true, isOnline: true, type: true } });
const changes = [];
for (const e of evs) {
  const next = canonicalRegion(e);
  if (next !== e.region) changes.push({ e, next });
}
console.log(`total events: ${evs.length} | region changes: ${changes.length} | APPLY=${APPLY}`);
for (const { e, next } of changes) {
  console.log(`  ${JSON.stringify(e.region)} -> ${JSON.stringify(next)}  | ${e.location ?? (e.isOnline ? "(online)" : "(no loc)")} :: ${e.title}`);
  if (APPLY) await db.event.update({ where: { id: e.id }, data: { region: next } });
}
if (APPLY) {
  const rows = await db.$queryRawUnsafe('SELECT region, count(*) c FROM "Event" GROUP BY region ORDER BY c DESC');
  console.log("--- final region distribution ---");
  for (const r of rows) console.log("  ", JSON.stringify(r.region), ":", Number(r.c));
}
await db.$disconnect();
