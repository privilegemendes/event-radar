import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, requireAdmin, authErrorResponse } from "@/lib/session";
import { serializeAudienceSignals } from "@/lib/events";
import { isOwner } from "@/lib/owner";
import { mergeEventWithOpportunity, splitEventUpdate } from "@/lib/opportunity";

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

    /* Partial update. The body is flat — objective fields and this speaker's
       fields together, the same shape reads return — so it is split before
       anything is written: catalogue columns to Event, personal ones to this
       speaker's own EventOpportunity row. */
    const { eventData: rawEvent, opportunityData: rawOpportunity } = splitEventUpdate(body);

    const eventData: Record<string, unknown> = {};
    const strFields = ["title", "location", "region", "url", "contact", "description",
      "sourceNote", "partnerId", "paidNote", "ticketCost", "audienceDescription",
      "otherSpeakers", "howToApply", "industry", "type",
      "applyUrl", "attendUrl", "socialLinks"];  // socialLinks is stored as JSON string
    for (const f of strFields) if (f in rawEvent) eventData[f] = rawEvent[f] ?? null;
    if ("audienceSignals" in rawEvent) {
      eventData.audienceSignals = Array.isArray(rawEvent.audienceSignals)
        ? serializeAudienceSignals(rawEvent.audienceSignals as string[])
        : (rawEvent.audienceSignals ?? null);
    }
    if ("startDate" in rawEvent)   eventData.startDate   = rawEvent.startDate   ? new Date(rawEvent.startDate as string)   : null;
    if ("endDate" in rawEvent)     eventData.endDate     = rawEvent.endDate     ? new Date(rawEvent.endDate as string)     : null;
    if ("cfpDeadline" in rawEvent) eventData.cfpDeadline = rawEvent.cfpDeadline ? new Date(rawEvent.cfpDeadline as string) : null;
    if ("isOnline" in rawEvent)      eventData.isOnline      = Boolean(rawEvent.isOnline);
    if ("isCoderEvent" in rawEvent)  eventData.isCoderEvent  = Boolean(rawEvent.isCoderEvent);
    if ("isPaid" in rawEvent)        eventData.isPaid        = rawEvent.isPaid == null ? null : Boolean(rawEvent.isPaid);
    if ("audienceSize" in rawEvent)  eventData.audienceSize  = rawEvent.audienceSize != null ? Number(rawEvent.audienceSize) : null;

    const opportunityData: Record<string, unknown> = {};
    for (const f of ["relevancyRationale", "acceptanceLikelihood", "acceptanceRationale",
                     "suggestedAction", "category", "status", "pitchDraft",
                     "readiness", "prepStage", "customTasks"]) {
      if (f in rawOpportunity) opportunityData[f] = rawOpportunity[f] ?? null;
    }
    if ("followUpAt" in rawOpportunity)      opportunityData.followUpAt      = rawOpportunity.followUpAt ? new Date(rawOpportunity.followUpAt as string) : null;
    if ("attending" in rawOpportunity)       opportunityData.attending       = Boolean(rawOpportunity.attending);
    if ("employerRelevant" in rawOpportunity) opportunityData.employerRelevant = Boolean(rawOpportunity.employerRelevant);
    if ("private" in rawOpportunity)         opportunityData.private         = Boolean(rawOpportunity.private);
    if ("relevancyScore" in rawOpportunity)  opportunityData.relevancyScore  = rawOpportunity.relevancyScore != null ? Number(rawOpportunity.relevancyScore) : null;

    /* A non-admin may only move an event through review and track their own
       preparation. Everything else is stripped — and note all of it now lands
       on their OWN opportunity row, so a reviewer can no longer change what
       another speaker sees. */
    if (!isAdmin) {
      const reviewerFields = new Set(["status", "attending", "readiness", "prepStage", "customTasks", "followUpAt"]);
      for (const k of Object.keys(opportunityData)) if (!reviewerFields.has(k)) delete opportunityData[k];
      for (const k of Object.keys(eventData)) delete eventData[k];
      if (typeof opportunityData.status === "string" && !["DISCOVERED", "APPROVED", "REJECTED"].includes(opportunityData.status)) {
        return NextResponse.json({ error: "Reviewers can only approve or reject events" }, { status: 403 });
      }
      if (Object.keys(opportunityData).length === 0) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    if (Object.keys(eventData).length) {
      await db.event.update({ where: { id }, data: eventData });
    }
    if (Object.keys(opportunityData).length) {
      await db.eventOpportunity.upsert({
        where: { userId_eventId: { userId: session.userId, eventId: id } },
        create: { userId: session.userId, eventId: id, ...opportunityData },
        update: opportunityData,
      });
    }

    const updated = await db.event.findUnique({
      where: { id },
      include: {
        partner: { select: { id: true, name: true } },
        opportunities: { where: { userId: session.userId }, take: 1 },
      },
    });
    return NextResponse.json(mergeEventWithOpportunity(updated as Record<string, unknown>, updated?.opportunities[0]));
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
