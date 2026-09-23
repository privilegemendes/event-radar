import { NextRequest, NextResponse } from "next/server";
import { requireSession, authErrorResponse } from "@/lib/session";
import { saveSummary } from "@/lib/executive-summary";

/**
 * Store a summary written elsewhere, under this speaker's own key.
 *
 * Prose with no schema, so it is stored as sent — and it is scoped to the
 * caller, served to nobody else, which is what makes that reasonable. It
 * replaces any previous summary, which is the point: a summary is a snapshot
 * of the data as it stands, not a record to preserve.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = await request.json().catch(() => null) as { summary?: unknown } | null;

    const markdown = typeof body?.summary === "string" ? body.summary.trim() : "";
    if (!markdown) {
      return NextResponse.json({ error: "Body must be { summary: \"…\" }" }, { status: 400 });
    }

    const generatedAt = await saveSummary(session.userId, markdown);
    return NextResponse.json({ ok: true, generatedAt, length: markdown.length });
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
