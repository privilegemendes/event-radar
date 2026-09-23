import { NextRequest, NextResponse } from "next/server";
import { requireSession, authErrorResponse } from "@/lib/session";
import { applyScores, type ScoreSubmission } from "@/lib/scoring";

export const maxDuration = 60;

/**
 * Accept scores judged elsewhere, for the signed-in speaker.
 *
 * The counterpart to GET /api/events/score/pending. Writes only the caller's
 * own opportunity rows, and only where no score exists yet — a score already
 * set, including one a speaker corrected by hand, is never overwritten.
 *
 * Every entry is validated by normaliseScore, exactly as a server-side model
 * reply is: a submission from a connector is no more trusted than an API
 * response, and neither is trusted to have followed the rubric.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = await request.json().catch(() => null) as { scores?: unknown } | null;

    if (!Array.isArray(body?.scores)) {
      return NextResponse.json(
        { error: "Body must be { scores: [ { eventId, … }, … ] }" },
        { status: 400 },
      );
    }

    const outcome = await applyScores(session.userId, body.scores as ScoreSubmission[]);

    return NextResponse.json({
      ...outcome,
      note: outcome.skipped
        ? `${outcome.skipped} already had a score and were left alone.`
        : undefined,
    });
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
