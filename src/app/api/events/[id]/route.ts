import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, requireAdmin, authErrorResponse } from "@/lib/session";
import { isOwner } from "@/lib/owner";
import { mergeEventWithOpportunity } from "@/lib/opportunity";
import { updateEventForSpeaker } from "@/lib/event-update";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const event = await db.event.findUnique({
      where: { id },
      include: {
        partner: { select: { id: true, name: true, category: true } },
        // This speaker's row only.
        opportunities: { where: { userId: session.userId }, take: 1 },
      },
    });
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Owner-only (nomad) events are hidden from everyone except the owner.
    if (event.ownerOnly && !isOwner(session)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(mergeEventWithOpportunity(event, event.opportunities[0]));
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const isAdmin = session.role === "ADMIN";
    const { id } = await params;
    const body = await request.json();

    /* The whole operation lives in updateEventForSpeaker — the field split, the
       coercions and the non-admin restriction together. This route turns a
       request into its arguments and a result into a response, and the MCP
       tool calls the same function, so the two cannot disagree about what a
       reviewer is allowed to change. */
    const result = await updateEventForSpeaker(session.userId, isAdmin, id, body);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.event);
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    await db.event.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
