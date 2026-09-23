import { NextResponse } from "next/server";
import { requireSession, authErrorResponse } from "@/lib/session";
import { isOwner } from "@/lib/owner";
import { buildSummaryBrief } from "@/lib/executive-summary";

/**
 * The brief for an executive summary, for a caller writing it itself.
 *
 * POST /api/executive-summary does the whole thing with the deployment's
 * Anthropic credentials; this is the same operation for a surface bringing its
 * own model. The aggregates and the wording come from the same function either
 * way — a summary written from a paraphrased brief answers a different
 * question.
 */
export async function GET() {
  try {
    const session = await requireSession();
    const { brief, stats } = await buildSummaryBrief(session.userId, isOwner(session));

    return NextResponse.json({
      brief,
      stats,
      next: "Write the summary from `brief` in GitHub-flavoured Markdown, then POST it to /api/executive-summary/result.",
    });
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
