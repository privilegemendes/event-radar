import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, getSession } from "@/lib/session";
import { serializeAudienceSignals } from "@/lib/events";
import { isOwner } from "@/lib/owner";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Public read: viewing is open.
    const { id } = await params;
    const event = await db.event.findUnique({
      where: { id },
      include: { partner: { select: { id: true, name: true, category: true } } },
    });
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Owner-only (nomad) events are hidden from everyone except the owner.
    if (event.ownerOnly && !isOwner(await getSession())) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(event);
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
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

    /* Partial update: only touch fields present in the request body. */
    const data: Record<string, unknown> = {};
    const strFields = ["title", "location", "region", "url", "contact", "description",
      "sourceNote", "partnerId", "pitchDraft", "paidNote", "ticketCost", "audienceDescription",
      "otherSpeakers", "acceptanceLikelihood", "acceptanceRationale", "howToApply",
      "industry", "relevancyRationale", "suggestedAction", "type", "status", "category",
      "readiness", "prepStage", "customTasks",
      "applyUrl", "attendUrl", "socialLinks"];  // socialLinks is stored as JSON string
    for (const f of strFields) if (f in body) data[f] = body[f] ?? null;
    if ("audienceSignals" in body) {
      data.audienceSignals = Array.isArray(body.audienceSignals)
        ? serializeAudienceSignals(body.audienceSignals)
        : (body.audienceSignals ?? null);
    }
    if ("startDate" in body)   data.startDate   = body.startDate   ? new Date(body.startDate)   : null;
    if ("endDate" in body)     data.endDate     = body.endDate     ? new Date(body.endDate)     : null;
    if ("cfpDeadline" in body) data.cfpDeadline = body.cfpDeadline ? new Date(body.cfpDeadline) : null;
    if ("followUpAt" in body)  data.followUpAt  = body.followUpAt  ? new Date(body.followUpAt)  : null;
    if ("isOnline" in body)      data.isOnline      = Boolean(body.isOnline);
    if ("attending" in body)    data.attending    = Boolean(body.attending);
    if ("isCoderEvent" in body) data.isCoderEvent = Boolean(body.isCoderEvent);
    if ("coderRelevant" in body) data.coderRelevant = Boolean(body.coderRelevant);
    if ("isPaid" in body)        data.isPaid        = body.isPaid == null ? null : Boolean(body.isPaid);
    if ("audienceSize" in body)  data.audienceSize  = body.audienceSize  != null ? Number(body.audienceSize)  : null;
    if ("relevancyScore" in body) data.relevancyScore = body.relevancyScore != null ? Number(body.relevancyScore) : null;

    /* Non-admin reviewers (any signed-in Coder user) may only move an event through
       the review workflow — approve/reject and their own readiness tracking. They
       cannot edit event content. Strip everything else and require at least one
       allowed field. */
    if (!isAdmin) {
      const reviewerFields = new Set(["status", "attending", "readiness", "prepStage", "customTasks", "followUpAt"]);
      for (const k of Object.keys(data)) if (!reviewerFields.has(k)) delete data[k];
      if (typeof data.status === "string" && !["DISCOVERED", "APPROVED", "REJECTED"].includes(data.status as string)) {
        return NextResponse.json({ error: "Reviewers can only approve or reject events" }, { status: 403 });
      }
      if (Object.keys(data).length === 0) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const event = await db.event.update({
      where: { id },
      data,
      include: { partner: { select: { id: true, name: true } } },
    });

    return NextResponse.json(event);
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    await db.event.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
