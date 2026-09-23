import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAnthropic, messagesUrl } from "@/lib/anthropic";
import { requireSession, authErrorResponse, type Session } from "@/lib/session";
import { getSetting, setSetting } from "@/lib/settings";
import { deriveCategory } from "@/lib/events";
import { costBucket } from "@/lib/constants";
import { isOwner } from "@/lib/owner";
import { getApplicantProfile } from "@/lib/settings";
import { buildSpeakerProfile, speakerName } from "@/lib/speaker-brief";

export const maxDuration = 120;

/**
 * Where a speaker's generated summary is cached.
 *
 * Per user. computeStats has been per-speaker since Phase 2, but the generated
 * text was written to a single global AppSetting row, so the page showed your
 * numbers above whoever last pressed Generate — two different people on one
 * screen with nothing saying so.
 *
 * The old un-suffixed "exec_summary" row is left where it is rather than
 * migrated onto one person: it was written from whichever speaker happened to
 * generate last, and assigning it to someone would be a guess. Nothing reads it
 * now, and a summary is regenerated in one click.
 */
const summaryKey = (userId: string) => `exec_summary:${userId}`;
const summaryAtKey = (userId: string) => `exec_summary_at:${userId}`;

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

/* Stats are computed from ONE speaker's opportunities: the tracks, scores and
   pipeline are their view of the catalogue, and summing them across speakers
   would produce a number describing nobody. */
async function computeStats(userId: string, owner: boolean) {
  const rows = await db.eventOpportunity.findMany({
    where: { userId, ...(owner ? {} : { private: false }) },
    select: {
      status: true, category: true, suggestedAction: true, relevancyScore: true,
      employerRelevant: true,
      event: {
        select: {
          title: true, region: true, city: true, type: true, isCoderEvent: true,
          partnerId: true, ticketCost: true, howToApply: true, description: true,
          startDate: true, url: true, audienceSignals: true, industry: true,
        },
      },
    },
  });

  // Flatten to the shape the rest of this file already works with.
  const events = rows.map((r) => ({
    ...r.event,
    status: r.status, category: r.category, suggestedAction: r.suggestedAction,
    relevancyScore: r.relevancyScore, coderRelevant: r.employerRelevant,
  })) as unknown as Ev[];
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
  let session: Session;
  try {
    session = await requireSession();
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    throw err;
  }

  const stats = await computeStats(session.userId, isOwner(session));
  const summary = await getSetting(summaryKey(session.userId));
  const generatedAt = await getSetting(summaryAtKey(session.userId));
  return NextResponse.json({ stats, summary, generatedAt });
}

export async function POST() {
  /* This route needs the session itself (for isOwner) and has no try/catch of
     its own, so the guard is wrapped rather than the whole handler.

     requireSession, not requireAdmin: the summary is per speaker end to end —
     computeStats reads the caller's own opportunities, the brief is their own
     profile, and it is stored under a key scoped to their user id. Generation
     therefore touches nobody else's data, and an admin-only gate left a MEMBER
     staring at "No summary generated yet" with no way to generate one. */
  let session: Session;
  try {
    session = await requireSession();
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    throw err;
  }

  const stats = await computeStats(session.userId, isOwner(session));
  const anthropic = resolveAnthropic(process.env);
  if (!anthropic) return NextResponse.json({ error: "LLM not configured" }, { status: 503 });

  const profile = await getApplicantProfile(session.userId);
  const name = speakerName(profile);
  const hasEmployerAngle = !!(profile.employerAngle ?? "").trim();

  const brief = `You are advising this speaker:

${buildSpeakerProfile(profile, "full")}

Their tracks: SPEAK (realistic personal speaking slots), ${hasEmployerAngle ? "PARTICIPATE (events attended in the employer role — partner, enterprise and analyst events), " : ""}ATTEND (personal learning and network).

Here is the current Event Radar dataset (aggregated):
Totals: ${JSON.stringify(stats.totals)}
Events by macro region: ${JSON.stringify(stats.byMacro)}
Region × track split: ${JSON.stringify(stats.regionTrack)}
Events by type: ${JSON.stringify(stats.byType)}
Events by track: ${JSON.stringify(stats.byTrack)}
Cost/access breakdown: ${JSON.stringify(stats.byCost)}
Top cities: ${JSON.stringify(stats.topCities)}
Highest-relevancy upcoming events: ${JSON.stringify(stats.topEvents.map(e => ({ t: e.title, city: e.city, score: e.score, action: e.action })))}

Write a sharp, decision-useful EXECUTIVE SUMMARY & RECOMMENDATIONS in GitHub-flavoured Markdown. Be specific and quantitative, reference real event names and cities from the data, and think in terms of "who would be in the room" and "time well invested" for ${name}. Cover, using '## ' section headings:
## Strategy in one paragraph
## Best-hit events (where to actually go)  — a short prioritized list with why (audience + payoff), grouped by track
## Regional read — what each region is focused on and how they differ (North America vs Europe vs UK vs Online)
## Trends & observations from the data
## Recommendations & next actions — concrete, prioritized
Keep it tight (450-700 words). No preamble, start at the first '## ' heading.`;

  const res = await fetch(messagesUrl(anthropic), {
    method: "POST",
    headers: anthropic.headers,
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 3000, messages: [{ role: "user", content: brief }] }),
  });
  if (!res.ok) return NextResponse.json({ error: `LLM error: ${(await res.text()).slice(0, 200)}` }, { status: 502 });
  const data = await res.json() as { content: Array<{ type: string; text?: string }> };
  const md = data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();

  await setSetting(summaryKey(session.userId), md);
  const now = new Date().toISOString();
  await setSetting(summaryAtKey(session.userId), now);
  return NextResponse.json({ ok: true, summary: md, generatedAt: now, stats });
}
