import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, getSession, authErrorResponse } from "@/lib/session";
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
    await requireSession();
    // are hidden from everyone except the owner.
    const visible = isOwner(await getSession()) ? {} : { ownerOnly: false };

    const [inbox, gigs, coderEvents] = await Promise.all([
      // Inbox badge: events awaiting review.
      db.event.count({ where: { ...visible, status: "DISCOVERED" } }),
      // Podium badge: accepted speaking gigs plus anything marked as attending.
      db.event.count({ where: { ...visible, OR: [{ status: "ACCEPTED" }, { attending: true }] } }),
      // Coder Events badge: EMEA events from Coder's own schedule. Macro regions,
      // matching EMEA_REGIONS on the Coder Events page and what deriveGeo() writes.
      db.event.count({
        where: { ...visible, isCoderEvent: true, region: { in: ["Europe", "UK"] } },
      }),
    ]);

    return NextResponse.json({ inbox, gigs, coderEvents });
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
