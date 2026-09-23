import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, authErrorResponse } from "@/lib/session";
import { badgeCountWhere } from "@/lib/event-filter";

/**
 * Badge counts for the sidebar.
 *
 * The sidebar renders three integers on every page and re-reads them on every
 * navigation. It used to fetch the full event list three times and call
 * .length, which cost ~1.8 MB per page view; these are the same predicates as
 * COUNTs.
 *
 * "The same predicates" is now literal. These were hand-written copies of the
 * list endpoint's filters and had drifted from them in three ways at once —
 * see badgeCountWhere. A badge whose number does not match the page behind it
 * is worse than no badge, because it sends someone to an empty screen.
 */
export async function GET() {
  try {
    const session = await requireSession();

    const [inbox, gigs] = await Promise.all([
      db.event.count({ where: badgeCountWhere(session.userId, "inbox") }),
      db.event.count({ where: badgeCountWhere(session.userId, "podium") }),
    ]);

    /* Company events stay an Event-level count: it is a property of the event
       (on the company schedule, in EMEA), not of anyone's opinion of it. */
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
