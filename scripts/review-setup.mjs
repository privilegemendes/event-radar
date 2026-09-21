import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

// 1) Make the shared Coder reviewer login usable (known password, no forced change).
const VIEWER_PW = process.env.VIEWER_PW || "CoderReview2026!";
const hash = await bcrypt.hash(VIEWER_PW, 10);
const vu = await db.user.updateMany({ where: { email: "viewer@coder.com" }, data: { passwordHash: hash, mustChangePassword: false } });
console.log("viewer account updated:", vu.count, "| password:", VIEWER_PW);

// 2) Remove REJECTED events.
const rej = await db.event.deleteMany({ where: { status: "REJECTED" } });
console.log("deleted REJECTED events:", rej.count);

// 3) Bulk-approve all relevant DISCOVERED events that are NOT vertical/industry-specific.
const VERTICAL = new RegExp([
  "healthcare", "health\\s?tech", "\\bmedical\\b", "\\bmedicine\\b", "medtech", "\\bhospital\\b", "clinical",
  "clinician", "\\bpharma\\b", "pharmaceutical", "biotech", "biopharma", "life sciences", "\\bpatient", "genomics",
  "oncology", "\\bdental\\b", "digital health", "health system",
  "\\bbanking\\b", "\\bbank\\b", "fintech", "financial services", "\\binsurance\\b", "insurtech", "\\bwealth\\b",
  "capital markets", "\\bpayments\\b", "\\btreasury\\b", "\\baccounting\\b", "\\btax\\b", "\\bmortgage\\b",
  "\\blegal\\b", "legaltech", "law firm",
  "\\bretail\\b", "ecommerce", "e-commerce", "\\bcpg\\b", "consumer packaged goods", "\\bgrocery\\b",
  "manufacturing", "\\bindustrial\\b", "\\bfactory\\b",
  "oil and gas", "oil & gas", "\\butilities\\b", "power grid",
  "\\btelecom\\b", "telecommunications",
  "\\bgovernment\\b", "public sector", "govtech", "gov tech", "\\bdefense\\b", "\\bdefence\\b", "\\bmilitary\\b", "\\bfederal\\b",
  "edtech", "k-12", "\\bk12\\b", "higher education",
  "automotive", "\\baviation\\b", "aerospace", "\\bairline",
  "real estate", "proptech", "construction",
  "agriculture", "agritech", "\\bagtech\\b", "\\bfarming\\b",
  "hospitality", "\\bhotel\\b", "\\brestaurant\\b", "\\btourism\\b", "travel industry",
  "logistics", "supply chain", "\\bfreight\\b", "\\bmaritime\\b",
  "\\bmining\\b",
  "igaming", "\\bcasino\\b", "sports betting",
  "public safety", "\\bpolicing\\b",
].join("|"), "i");

const disc = await db.event.findMany({
  where: { status: "DISCOVERED" },
  select: { id: true, title: true, industry: true, description: true, audienceDescription: true },
});

let approved = 0;
const skipped = [];
for (const e of disc) {
  const hay = [e.title, e.industry, e.description, e.audienceDescription].filter(Boolean).join("  ");
  const m = hay.match(VERTICAL);
  if (m) { skipped.push(`${e.title}  [${m[0]}]`); continue; }
  await db.event.update({ where: { id: e.id }, data: { status: "APPROVED" } });
  approved++;
}
console.log("APPROVED:", approved, "| left as DISCOVERED (vertical):", skipped.length);
console.log("--- skipped (vertical) ---");
for (const s of skipped) console.log("  •", s);

const counts = await db.$queryRawUnsafe('SELECT status, count(*) c FROM "Event" GROUP BY status ORDER BY c DESC');
console.log("status counts:", counts.map((x) => `${x.status}:${Number(x.c)}`).join(", "));
await db.$disconnect();
