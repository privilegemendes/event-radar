import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, authErrorResponse } from "@/lib/session";
import { isOwner } from "@/lib/owner";
import { inboxCountWhere, podiumMatch, upcomingOrDateless } from "@/lib/event-filter";

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

       The gigs badge stays an EventOpportunity count: ACCEPTED, SPOKEN and
       attending are not what a missing row defaults to, so there is no no-row
       half to miss, and the podium's own filter agrees by passing
       matchesDefault=false. Both halves of what /podiums lists are now shared
       with it rather than restated — what counts as a gig, and the date bound,
       which is reached through the relation because startDate is a fact about
       the event. Restating them is how the badge came to count gigs that had
       already happened, and to miss ones marked SPOKEN, above a page showing
       neither. */
    const mine = { userId: session.userId };
    const visible = isOwner(session) ? {} : { private: false };

    const [inbox, gigs] = await Promise.all([
      db.event.count({ where: inboxCountWhere(session.userId) }),
      db.eventOpportunity.count({
        where: {
          ...mine,
          ...visible,
          ...podiumMatch(),
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
