import { NextRequest, NextResponse } from "next/server";
import { requireSession, authErrorResponse } from "@/lib/session";
import { selectUnscoredEvents, buildScoringBrief } from "@/lib/scoring";
import { renderEventFacts, LIKELIHOODS, ACTIONS, CATEGORIES } from "@/lib/scoring-parse";

/**
 * The inputs for scoring, for a caller that will do the judging itself.
 *
 * POST /api/events/score runs the whole thing server-side using the
 * deployment's Anthropic credentials. This endpoint is the other half of the
 * same operation, for a surface that brings its own model — an MCP client
 * scoring on the person's own subscription. The events and the rubric come
 * from the same functions either way; only the reader changes.
 *
 * requireSession, not requireAdmin, and no userId parameter: a speaker scores
 * their own inbox and nobody else's, matching POST /api/events/score.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const raw = Number(new URL(request.url).searchParams.get("limit"));
    const limit = Number.isInteger(raw) && raw > 0 ? raw : 25;

    const [events, brief] = await Promise.all([
      selectUnscoredEvents(session.userId, limit),
      buildScoringBrief(session.userId),
    ]);

    return NextResponse.json({
      total: events.length,
      /* The same rendering the server-side prompt uses, so a client judges the
         same facts in the same shape rather than a paraphrase of them. */
      events: events.map((e, i) => ({ eventId: e.id, facts: renderEventFacts(e, i) })),
      brief,
      /* Named rather than described in prose: a value outside these is
         discarded by normaliseScore on the way in, so a caller should not have
         to guess and lose its work. */
      allowed: {
        relevancyScore: "integer 0-100",
        acceptanceLikelihood: LIKELIHOODS,
        suggestedAction: ACTIONS,
        category: CATEGORIES,
        employerRelevant: "boolean",
      },
      next: events.length
        ? "Judge each event against `brief`, then POST the verdicts to /api/events/score/results."
        : "Nothing left to score.",
    });
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
