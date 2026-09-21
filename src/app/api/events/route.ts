import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, getSession } from "@/lib/session";
import { EventStatus, EventType } from "@prisma/client";
import { serializeAudienceSignals } from "@/lib/events";
import { isOwner } from "@/lib/owner";

export async function GET(request: NextRequest) {
  try {
    // Public read: viewing is open to anyone who can reach the app.
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status") as EventStatus | null;
    const type   = searchParams.get("type") as EventType | null;
    const coderRelevant = searchParams.get("coderRelevant");
    const isCoderEvent  = searchParams.get("isCoderEvent");
    const region = searchParams.get("region");
    const search = searchParams.get("search");
    const category = searchParams.get("category");

    const where: Record<string, unknown> = {};
    // Owner-only (nomad) events are hidden from everyone except the owner.
    if (!isOwner(await getSession())) where.ownerOnly = false;
    if (status) where.status = status;
    if (type)   where.type   = type;
    if (coderRelevant === "true")  where.coderRelevant = true;
    if (coderRelevant === "false") where.coderRelevant = false;
    if (isCoderEvent  === "true")  where.isCoderEvent  = true;
    if (isCoderEvent  === "false") where.isCoderEvent  = false;
    if (region) where.region = region;
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { title:       { contains: search } },
        { description: { contains: search } },
        { location:    { contains: search } },
      ];
    }

    const events = await db.event.findMany({
      where,
      include: { partner: { select: { id: true, name: true, region: true, category: true } } },
      orderBy: [{ startDate: { sort: "asc", nulls: "last" } }, { cfpDeadline: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    });

    return NextResponse.json(events);
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const event = await db.event.create({
      data: {
        title:               body.title,
        type:                body.type,
        startDate:           body.startDate    ? new Date(body.startDate)    : null,
        endDate:             body.endDate      ? new Date(body.endDate)      : null,
        location:            body.location     ?? null,
        isOnline:            body.isOnline     ?? false,
        region:              body.region       ?? null,
        coderRelevant:       body.coderRelevant ?? false,
        category:            body.category ?? null,
        audienceSignals:     Array.isArray(body.audienceSignals)
                               ? serializeAudienceSignals(body.audienceSignals)
                               : (body.audienceSignals ?? null),
        status:              body.status       ?? "DISCOVERED",
        cfpDeadline:         body.cfpDeadline  ? new Date(body.cfpDeadline) : null,
        url:                 body.url          ?? null,
        contact:             body.contact      ?? null,
        description:         body.description  ?? null,
        sourceNote:          body.sourceNote   ?? null,
        partnerId:           body.partnerId    ?? null,
        followUpAt:          body.followUpAt   ? new Date(body.followUpAt)   : null,
        isCoderEvent:        body.isCoderEvent ?? false,
        isPaid:              body.isPaid       ?? null,
        paidNote:            body.paidNote     ?? null,
        audienceDescription: body.audienceDescription ?? null,
        audienceSize:        body.audienceSize != null ? Number(body.audienceSize) : null,
        otherSpeakers:       body.otherSpeakers       ?? null,
        acceptanceLikelihood: body.acceptanceLikelihood ?? null,
        acceptanceRationale:  body.acceptanceRationale  ?? null,
        howToApply:          body.howToApply   ?? null,
        applyUrl:            body.applyUrl     ?? null,
        attendUrl:           body.attendUrl    ?? null,
        industry:            body.industry     ?? null,
        relevancyScore:      body.relevancyScore != null ? Number(body.relevancyScore) : null,
        relevancyRationale:  body.relevancyRationale  ?? null,
        suggestedAction:     body.suggestedAction      ?? null,
      },
      include: { partner: { select: { id: true, name: true, region: true, category: true } } },
    });

    return NextResponse.json(event, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
