import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, authErrorResponse } from "@/lib/session";
import { inboxCountWhere, podiumCountWhere } from "@/lib/event-filter";

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

       Both badges are Event counts carrying the where clause of the page they
       sit above, composed from the same helpers those pages compose. They used
       to restate those clauses and disagreed with both: the inbox badge could
       not see the events this speaker has no opportunity row for, and the gigs
       badge counted gigs that had already happened, missed ones marked SPOKEN,
       and hid a speaker's own private gig from them. See src/lib/event-filter.ts. */
    const [inbox, gigs] = await Promise.all([
      db.event.count({ where: inboxCountWhere(session.userId) }),
      db.event.count({ where: podiumCountWhere(session.userId) }),
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
