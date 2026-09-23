import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, requireAdmin, authErrorResponse } from "@/lib/session";
import { serializeAudienceSignals } from "@/lib/events";
import { listEventsForSpeaker } from "@/lib/event-list";
import { parsePage } from "@/lib/pagination";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view");
    const page = parsePage(searchParams);

    /* The whole listing operation lives in listEventsForSpeaker — the filters,
       the view's semantics and its projection together. This route's job is to
       turn a query string into those arguments and a response out of the
       result; it deliberately does not reassemble any of it, because when it
       did, the MCP tool assembled a subtly different version and served events
       that had already happened. */
    const { events, total } = await listEventsForSpeaker(
      session.userId,
      {
        status:        searchParams.get("status"),
        type:          searchParams.get("type"),
        region:        searchParams.get("region"),
        search:        searchParams.get("search"),
        category:      searchParams.get("category"),
        coderRelevant: searchParams.get("coderRelevant"),
        isCoderEvent:  searchParams.get("isCoderEvent"),
        view,
      },
      page,
    );

    /* The response stays a bare ARRAY so every existing caller is untouched;
       the total rides in a header instead. */
    if (!page.paginated) return NextResponse.json(events);

    return NextResponse.json(events, {
      headers: {
        "X-Total-Count":    String(total),
        "X-Returned-Count": String(events.length),
      },
    });
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
