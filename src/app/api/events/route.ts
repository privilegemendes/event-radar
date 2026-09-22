import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, requireAdmin, authErrorResponse } from "@/lib/session";
import { EventStatus, EventType, Prisma } from "@prisma/client";
import { serializeAudienceSignals } from "@/lib/events";
import { mergeEventWithOpportunity, OPPORTUNITY_WIRE_FIELDS } from "@/lib/opportunity";
import { speakerConditions, upcomingOrUndated } from "@/lib/event-filter";

/**
 * Named data contracts for the list endpoint. This route returns every matching
 * event, so columns a consumer never renders are pure transfer cost — at ~1250
 * events the full payload is ~1.9 MB, while the map needs four columns of it.
 *
 * Each set is traced from what the page AND the components it hands events to
 * actually read at runtime, not from the page's local interface: those are
 * incomplete and type the extras as optional, so TypeScript will not catch a
 * missing field. `isCoderEvent` and `url` in particular are undeclared on the
 * podium and inbox interfaces but read by EventAvatar.
 *
 * An unknown or absent `view` falls through to the full payload.
 */
const VIEWS: Record<string, Prisma.EventSelect> = {
  // Aggregated into location bubbles; no event object reaches a component.
  map: { region: true, location: true, isOnline: true, status: true },

  calendar: {
    id: true, title: true, type: true, status: true, startDate: true, endDate: true,
    partnerId: true, isCoderEvent: true,
    partner: { select: { name: true, category: true } },
  },

  // readiness/prepStage/customTasks feed ReadinessCard; isCoderEvent feeds its EventAvatar.
  podium: {
    id: true, title: true, type: true, url: true, startDate: true, endDate: true,
    location: true, isOnline: true, status: true, attending: true,
    readiness: true, prepStage: true, customTasks: true, isCoderEvent: true,
  },

  inbox: {
    id: true, title: true, type: true, cfpDeadline: true, startDate: true,
    location: true, isOnline: true, region: true, coderRelevant: true,
    sourceNote: true, industry: true, relevancyScore: true, relevancyRationale: true,
    suggestedAction: true, url: true, isCoderEvent: true,
    partner: { select: { name: true, region: true } },
  },
};

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status") as EventStatus | null;
    const type   = searchParams.get("type") as EventType | null;
    const coderRelevant = searchParams.get("coderRelevant");
    const isCoderEvent  = searchParams.get("isCoderEvent");
    const region = searchParams.get("region");
    const search = searchParams.get("search");
    const category = searchParams.get("category");
    const view   = searchParams.get("view");

    const where: Record<string, unknown> = {};

    /* Objective facts about the event itself stay on Event. */
    if (type)   where.type   = type;
    if (isCoderEvent  === "true")  where.isCoderEvent  = true;
    if (isCoderEvent  === "false") where.isCoderEvent  = false;
    if (region) where.region = region;
    if (search) {
      where.OR = [
        { title:       { contains: search } },
        { description: { contains: search } },
        { location:    { contains: search } },
      ];
    }

    /* Everything per-speaker — status, category, employer relevance, privacy,
       the podium's accepted/attending test — is filtered through THIS
       speaker's opportunity row. These used to read the Event columns, which
       stopped being updated when Phase 2 moved the writes; see
       src/lib/event-filter.ts. */
    const and: unknown[] = speakerConditions(session.userId, { status, category, coderRelevant, view });

    if (view === "podium") {
      // The date half is a fact about the event, so it is not routed through an
      // opportunity — but it is shared with the sidebar's badge count, which
      // previously omitted it and counted gigs that had already happened.
      and.push(upcomingOrUndated());
    }

    where.AND = and;

    const orderBy: Prisma.EventOrderByWithRelationInput[] = [
      { startDate: { sort: "asc", nulls: "last" } },
      { cfpDeadline: { sort: "asc", nulls: "last" } },
      { createdAt: "desc" },
    ];

    /* Only THIS speaker's row is fetched. Another speaker's opinion never
       reaches the query, so it cannot leak through the flattening below. */
    const opportunities = { where: { userId: session.userId }, take: 1 } as const;

    /* The projection views still name per-speaker columns, which now live on
       the opportunity. Strip them from the event select and let the merge
       supply them — otherwise a view would serve whatever stale value is still
       sitting on the Event row until Phase 3 drops those columns. */
    const personal = new Set<string>(OPPORTUNITY_WIRE_FIELDS);
    const viewSelect = view && VIEWS[view]
      ? Object.fromEntries(Object.entries(VIEWS[view]).filter(([k]) => !personal.has(k)))
      : undefined;

    // Prisma rejects `select` and `omit` in the same query, so the two shapes are
    // separate calls. Both share `where` and `orderBy`.
    const rows = viewSelect
      ? await db.event.findMany({ where, select: { ...viewSelect, id: true, opportunities }, orderBy })
      : await db.event.findMany({
          where,
          // Trim fields no list view renders — this endpoint returns every event, so
          // they are pure transfer cost. The detail route still returns the full row.
          // `ownerOnly` and `createdAt` stay usable above for filtering and ordering.
          omit: {
            ownerOnly:           true,
            followUpAt:          true,
            acceptanceRationale: true,
            attendUrl:           true,
            socialLinks:         true,
            createdAt:           true,
            updatedAt:           true,
          },
          include: { partner: { select: { id: true, name: true, region: true, category: true } }, opportunities },
          orderBy,
        });

    return NextResponse.json(
      rows.map((e) => mergeEventWithOpportunity(
        e as Record<string, unknown>,
        (e as { opportunities?: unknown[] }).opportunities?.[0] as never,
      )),
    );
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

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
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
