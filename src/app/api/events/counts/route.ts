import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, authErrorResponse } from "@/lib/session";
import { isOwner } from "@/lib/owner";
import { inboxCountWhere, upcomingOrDateless } from "@/lib/event-filter";

/**
 * Badge counts for the sidebar.
 *
 * The sidebar renders three integers on every page and re-reads them on every
 * navigation. It used to fetch the full event list three times and call .length,
 * which cost ~1.8 MB per page view; these are the same predicates as COUNTs.
 */
export async function GET() {
  try {
    const session = await requireSession();

    /* Counted per speaker, not per event: what one speaker still has to triage
       says nothing about what another has.

       The inbox badge is an Event count built from the very conditions the
       inbox list runs, because "still to triage" includes events this speaker
       has no opportunity row for at all — an EventOpportunity count cannot
       express that half. See src/lib/event-filter.ts.

       The gigs badge stays an EventOpportunity count: ACCEPTED and attending
       are not what a missing row defaults to, so there is no no-row half to
       miss, and the podium's own filter agrees by passing matchesDefault=false.
       It does take /podiums' date bound, reached through the relation because
       startDate is a fact about the event — without it the badge counted gigs
       that have already happened and stood above a page that lists none. */
    const mine = { userId: session.userId };
    const visible = isOwner(session) ? {} : { private: false };

    const [inbox, gigs] = await Promise.all([
      db.event.count({ where: inboxCountWhere(session.userId) }),
      db.eventOpportunity.count({
        where: {
          ...mine,
          ...visible,
          OR: [{ status: "ACCEPTED" }, { attending: true }],
          event: upcomingOrDateless(),
        },
      }),
    ]);

    /* Coder Events stays an Event-level count: it is a property of the event
       (on Coder's schedule, in EMEA), not of anyone's opinion of it. */
    const coderEvents = await db.event.count({
      where: { isCoderEvent: true, region: { in: ["Europe", "UK"] } },
    });

    return NextResponse.json({ inbox, gigs, coderEvents });
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
