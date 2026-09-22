import { NextRequest, NextResponse } from "next/server";
import { requireSession, authErrorResponse } from "@/lib/session";
import { scoreForSpeaker } from "@/lib/scoring";

export const maxDuration = 300;

/**
 * Score the shared catalogue for the signed-in speaker.
 *
 * Deliberately NOT admin-only, unlike discovery. Discovery spends money on web
 * search and writes rows everyone sees, so it is an admin action; scoring is
 * cheap, and it only ever writes the caller's own opportunity rows. A member
 * who cannot run this has no way to get their own scores at all.
 *
 * There is no `userId` parameter, for the same reason: scoring someone else's
 * inbox is not an operation this app has, not even for an admin.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = await request.json().catch(() => ({})) as { limit?: number };

    const result = await scoreForSpeaker(session.userId, { limit: body.limit });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, scored: result.scored },
        { status: result.status ?? 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      scored: result.scored,
      considered: result.considered,
    });
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error("Scoring error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
