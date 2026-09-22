import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runDiscovery, rotatingFocus } from "@/lib/discovery";
import { scoreForAllSpeakers } from "@/lib/scoring";
import { isAutoDiscoveryEnabled } from "@/lib/settings";

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
 * Safeguards:
 *   • Skips if auto-discovery is toggled off (AppSetting).
 *   • Skips if another run started in the last 10 minutes (no overlap / no spam).
 *   • Rotates the search focus each run so it keeps finding *new* events.
 *
 * Discovery only catalogues. Scoring runs straight after it, once per speaker,
 * so what lands in an inbox overnight is already judged against that speaker's
 * own brief — see docs/PER_SPEAKER_SPLIT.md.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    const key = new URL(request.url).searchParams.get("key") ?? "";
    const ok = auth === `Bearer ${secret}` || key === secret;
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isAutoDiscoveryEnabled())) {
    return NextResponse.json({ skipped: true, reason: "auto-discovery disabled" });
  }

  // Overlap guard: don't start if a run is fresh/in-flight.
  const recent = await db.discoveryRun.findFirst({ orderBy: { startedAt: "desc" } });
  if (recent && recent.status === "RUNNING" && Date.now() - new Date(recent.startedAt).getTime() < 10 * 60 * 1000) {
    return NextResponse.json({ skipped: true, reason: "a run is already in progress" });
  }

  const focus = await rotatingFocus();
  const result = await runDiscovery({ focus });

  /* Score whatever the catalogue now holds, including anything an earlier run
     left unscored. Runs even when this pass found nothing new — a speaker who
     just filled in their profile has a backlog of events nobody judged for
     them yet. */
  const scoring = await scoreForAllSpeakers();

  return NextResponse.json({
    ok: result.ok,
    focus,
    runId: result.runId,
    found: result.found,
    total: result.total,
    error: result.error,
    scored: scoring.scored,
    speakers: scoring.speakers,
    scoringErrors: scoring.errors.length ? scoring.errors : undefined,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
