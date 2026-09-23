import { NextRequest, NextResponse } from "next/server";
import { requireSession, authErrorResponse } from "@/lib/session";
import { savePitchDraft } from "@/lib/pitch";

/**
 * Save a pitch drafted elsewhere, to THIS speaker's own row.
 *
 * Unlike a score, a draft is prose with no schema to validate against, so it
 * is stored as sent. It is also not judgement about shared data: it lands on
 * the caller's own opportunity and is served to nobody else, which is what
 * makes accepting it as-is reasonable.
 *
 * It DOES overwrite an existing draft, deliberately — redrafting is the normal
 * way to use this, and a draft is a working document rather than a verdict
 * someone corrected.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = await request.json().catch(() => null) as { pitchDraft?: unknown } | null;

    const draft = typeof body?.pitchDraft === "string" ? body.pitchDraft.trim() : "";
    if (!draft) {
      return NextResponse.json({ error: "Body must be { pitchDraft: \"…\" }" }, { status: 400 });
    }

    return NextResponse.json({ pitchDraft: await savePitchDraft(session.userId, id, draft) });
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
