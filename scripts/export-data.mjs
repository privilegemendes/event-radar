import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "fs";
const db = new PrismaClient();
mkdirSync("exports", { recursive: true });

const events = await db.event.findMany({ include: { partner: { select: { name: true } } }, orderBy: [{ region: "asc" }, { startDate: "asc" }] });
const speakers = await db.speaker.findMany({ orderBy: { name: "asc" } });
const partners = await db.partner.findMany({ orderBy: { name: "asc" } });

const stamp = new Date().toISOString().slice(0, 10);

// 1) Full JSON
writeFileSync(`exports/event-radar-export-${stamp}.json`, JSON.stringify({
  exportedAt: new Date().toISOString(),
  counts: { events: events.length, speakers: speakers.length, partners: partners.length },
  events, speakers, partners,
}, null, 2));

// CSV helper
const csv = (rows, cols) => {
  const esc = (v) => {
    if (v == null) return "";
    let s = typeof v === "object" ? JSON.stringify(v) : String(v);
    s = s.replace(/\r?\n/g, " ").trim();
    if (/[",]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
};

// 2) Events CSV
const eventCols = ["title","type","status","category","suggestedAction","macroRegion","city","location","isOnline","startDate","endDate","cfpDeadline","coderRelevant","relevancyScore","industry","ticketCost","isPaid","paidNote","audienceDescription","audienceSize","howToApply","applyUrl","url","partner","sourceNote","description"];
const eventRows = events.map((e) => ({ ...e, macroRegion: e.region, partner: e.partner?.name ?? "",
  startDate: e.startDate?.toISOString().slice(0,10) ?? "", endDate: e.endDate?.toISOString().slice(0,10) ?? "", cfpDeadline: e.cfpDeadline?.toISOString().slice(0,10) ?? "" }));
writeFileSync(`exports/events-${stamp}.csv`, csv(eventRows, eventCols));

// 3) Speakers CSV
const speakerCols = ["name","title","company","region","topics","talkCount","linkedinUrl","background","outreachNote","eventsJson","sourceNote"];
writeFileSync(`exports/speakers-${stamp}.csv`, csv(speakers, speakerCols));

// 4) Partners CSV
const partnerCols = Object.keys(partners[0] ?? { id: "" });
writeFileSync(`exports/partners-${stamp}.csv`, csv(partners, partnerCols));

console.log("export written for", stamp);
console.log("events", events.length, "| speakers", speakers.length, "| partners", partners.length);
await db.$disconnect();
