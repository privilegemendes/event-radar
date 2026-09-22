import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, authErrorResponse } from "@/lib/session";
import { isOwner } from "@/lib/owner";

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

    /* Counted from this speaker's own opportunities, not from Event. The inbox
       and podium badges are per person: what one speaker still has to triage
       says nothing about what another has. */
    const mine = { userId: session.userId };
    const visible = isOwner(session) ? {} : { private: false };

    const [inbox, gigs] = await Promise.all([
      db.eventOpportunity.count({ where: { ...mine, ...visible, status: "DISCOVERED" } }),
      db.eventOpportunity.count({ where: { ...mine, ...visible, OR: [{ status: "ACCEPTED" }, { attending: true }] } }),
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
