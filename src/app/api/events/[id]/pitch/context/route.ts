import { NextRequest, NextResponse } from "next/server";
import { requireSession, authErrorResponse } from "@/lib/session";
import { buildPitchPrompt } from "@/lib/pitch";

/**
 * The pitch prompt, for a caller that will write the draft itself.
 *
 * POST /api/events/[id]/pitch does the whole thing with the deployment's
 * Anthropic credentials. This is the same operation for a surface bringing its
 * own model. The prompt is rendered by the same function either way — a pitch
 * written from a paraphrased brief is a different pitch, so the wording must
 * not fork between surfaces.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const built = await buildPitchPrompt(session.userId, id);
    if (!built) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      eventId: built.event.id,
      title: built.event.title,
      prompt: built.prompt,
      next: `Write the application from \`prompt\`, then POST it to /api/events/${id}/pitch/draft.`,
    });
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
