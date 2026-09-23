import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runDiscovery, rotatingFocus } from "@/lib/discovery";
import { scoreForAllSpeakers } from "@/lib/scoring";
import { isAutoDiscoveryEnabled } from "@/lib/settings";
import { planDiscovery } from "@/lib/cron-plan";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Automated, recurring discovery.
 *
 * Triggered on a schedule (Vercel Cron in production — see vercel.json — or a
 * workspace loop in dev). No admin session required; instead:
 *   • If CRON_SECRET is set, the request must present it as
 *     `Authorization: Bearer <secret>` (Vercel Cron does this automatically) or
 *     `?key=<secret>`. If CRON_SECRET is not set, the endpoint is open (dev).
 *
 * Two independent halves, and the toggle governs only the first:
 *
 *   DISCOVERY — finds new events. Web search, expensive, shared. Skipped when
 *     auto-discovery is toggled off, or when another run started in the last 10
 *     minutes. Rotates its search focus so each pass explores a new slice.
 *   SCORING — judges the catalogue once per speaker. No web search, cheap, and
 *     it runs on every invocation regardless of the toggle.
 *
 * They used to be one path: the toggle returned early, so turning discovery off
 * also turned scoring off, and "stop spending on web search but keep judging
 * what we already have" could not be expressed at all. Scoring has to run
 * independently — a speaker who has just written their brief has a backlog of
 * events nobody has judged for them, and none of that needs a new search.
 *
 * See docs/PER_SPEAKER_SPLIT.md.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    const key = new URL(request.url).searchParams.get("key") ?? "";
    const ok = auth === `Bearer ${secret}` || key === secret;
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  /* ── Discovery: optional ── */
  type DiscoveryReport =
    | { ran: false; reason: string }
    | { ran: true; ok: boolean; focus: string; runId: string; found?: number; total?: number; error?: string };

  const plan = planDiscovery({
    enabled: await isAutoDiscoveryEnabled(),
    recentRun: await db.discoveryRun.findFirst({ orderBy: { startedAt: "desc" }, select: { status: true, startedAt: true } }),
  });

  let discovery: DiscoveryReport;
  if (!plan.run) {
    discovery = { ran: false, reason: plan.reason };
  } else {
    const focus = await rotatingFocus();
    const result = await runDiscovery({ focus });
    discovery = { ran: true, ok: result.ok, focus, runId: result.runId, found: result.found, total: result.total, error: result.error };
  }

  /* ── Scoring: always ──
     Judges whatever the catalogue holds, including anything earlier passes left
     unscored. Independent of discovery on purpose: it needs no web search, and
     a backlog exists whether or not anything new was found today. */
  const scoring = await scoreForAllSpeakers();

  return NextResponse.json({
    ok: !discovery.ran || discovery.ok,
    discovery,
    scoring: {
      speakers: scoring.speakers,
      scored: scoring.scored,
      errors: scoring.errors.length ? scoring.errors : undefined,
    },
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
