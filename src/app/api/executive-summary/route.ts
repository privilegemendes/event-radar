import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getSetting, setSetting } from "@/lib/settings";
import { deriveCategory } from "@/lib/events";
import { costBucket } from "@/lib/constants";
import { isOwner } from "@/lib/owner";

export const maxDuration = 120;

type Ev = {
  title: string; region: string | null; city: string | null; type: string; status: string;
  category: string | null; suggestedAction: string | null; coderRelevant: boolean; isCoderEvent: boolean;
  partnerId: string | null; relevancyScore: number | null; ticketCost: string | null; howToApply: string | null;
  description: string | null; startDate: Date | null; url: string | null; audienceSignals: string | null; industry: string | null;
};

function countBy<T>(arr: T[], key: (t: T) => string | null | undefined) {
  const m: Record<string, number> = {};
  for (const t of arr) { const k = key(t); if (k) m[k] = (m[k] || 0) + 1; }
  return m;
}

async function computeStats(owner: boolean) {
  const events = (await db.event.findMany({
    where: owner ? {} : { ownerOnly: false },
    select: { title: true, region: true, city: true, type: true, status: true, category: true, suggestedAction: true, coderRelevant: true, isCoderEvent: true, partnerId: true, relevancyScore: true, ticketCost: true, howToApply: true, description: true, startDate: true, url: true, audienceSignals: true, industry: true },
  })) as Ev[];
  const speakerCount = await db.speaker.count();
  const partnerCount = await db.partner.count();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const byMacro = countBy(events, (e) => e.region);
  const byCity = countBy(events, (e) => e.city);
  const byType = countBy(events, (e) => e.type);
  const byTrack = countBy(events, (e) => deriveCategory(e));
  const byCost = countBy(events, (e) => costBucket(e));
  const byAction = countBy(events, (e) => e.suggestedAction);

  const topCities = Object.entries(byCity).sort((a, b) => b[1] - a[1]).slice(0, 12);

  const upcoming = events.filter((e) => e.startDate && new Date(e.startDate) >= today);
  const topEvents = [...upcoming]
    .filter((e) => e.relevancyScore != null)
    .sort((a, b) => (b.relevancyScore ?? 0) - (a.relevancyScore ?? 0))
    .slice(0, 15)
    .map((e) => ({ title: e.title, city: e.city, region: e.region, startDate: e.startDate, score: e.relevancyScore, action: e.suggestedAction, url: e.url }));

  // per-macro-region track split
  const regionTrack: Record<string, Record<string, number>> = {};
  for (const e of events) {
    const r = e.region ?? "Other"; regionTrack[r] = regionTrack[r] || {};
    const t = deriveCategory(e); regionTrack[r][t] = (regionTrack[r][t] || 0) + 1;
  }

  return {
    totals: { events: events.length, speakers: speakerCount, partners: partnerCount, upcoming: upcoming.length },
    byMacro, byType, byTrack, byCost, byAction, topCities, topEvents, regionTrack,
  };
}

export async function GET() {
  const stats = await computeStats(isOwner(await getSession()));
  const summary = await getSetting("exec_summary");
  const generatedAt = await getSetting("exec_summary_at");
  return NextResponse.json({ stats, summary, generatedAt });
}

export async function POST() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const stats = await computeStats(isOwner(session));
  const baseUrl = process.env.ANTHROPIC_BASE_URL, authToken = process.env.ANTHROPIC_AUTH_TOKEN;
  if (!baseUrl || !authToken) return NextResponse.json({ error: "LLM not configured" }, { status: 503 });

  const brief = `You are advising Irmak Eyiceoglu — EMEA Partner Manager at Coder (AI devtools / self-hosted cloud development environments) and a first-time speaker building a track record. Her tracks: SPEAK (realistic personal speaking slots — meetups, podcasts, workshops, small summits, Women-in-AI), PARTICIPATE (Coder-relevant / partner / enterprise / analyst events she attends in her Coder role), ATTEND (personal learning/network).

Here is the current Event Radar dataset (aggregated):
Totals: ${JSON.stringify(stats.totals)}
Events by macro region: ${JSON.stringify(stats.byMacro)}
Region × track split: ${JSON.stringify(stats.regionTrack)}
Events by type: ${JSON.stringify(stats.byType)}
Events by track: ${JSON.stringify(stats.byTrack)}
Cost/access breakdown: ${JSON.stringify(stats.byCost)}
Top cities: ${JSON.stringify(stats.topCities)}
Highest-relevancy upcoming events: ${JSON.stringify(stats.topEvents.map(e => ({ t: e.title, city: e.city, score: e.score, action: e.action })))}

Write a sharp, decision-useful EXECUTIVE SUMMARY & RECOMMENDATIONS in GitHub-flavoured Markdown. Be specific and quantitative, reference real event names and cities from the data, and think in terms of "who would be in the room" and "time well invested" for Irmak. Cover, using '## ' section headings:
## Strategy in one paragraph
## Best-hit events (where to actually go)  — a short prioritized list with why (audience + payoff), grouped by SPEAK vs PARTICIPATE
## Regional read — what each region is focused on and how they differ (North America vs Europe vs UK vs Online)
## Trends & observations from the data
## Recommendations & next actions — concrete, prioritized
Keep it tight (450-700 words). No preamble, start at the first '## ' heading.`;

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01", Authorization: `Bearer ${authToken}`, "x-api-key": authToken },
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 3000, messages: [{ role: "user", content: brief }] }),
  });
  if (!res.ok) return NextResponse.json({ error: `LLM error: ${(await res.text()).slice(0, 200)}` }, { status: 502 });
  const data = await res.json() as { content: Array<{ type: string; text?: string }> };
  const md = data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();

  await setSetting("exec_summary", md);
  const now = new Date().toISOString();
  await setSetting("exec_summary_at", now);
  return NextResponse.json({ ok: true, summary: md, generatedAt: now, stats });
}
