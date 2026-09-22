import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isOwner } from "@/lib/owner";

/**
 * Session probe for the client: signed in, what role, and are they the owner.
 *
 * Read by the inbox so any signed-in reviewer (MEMBER or ADMIN) can approve
 * events, and by the sidebar to decide whether to show the owner-only Podium.
 *
 * Kept as an explicit route rather than using Better Auth's /api/auth/get-session
 * because several pages read `role` and `isOwner` directly, and OWNER_EMAIL is
 * not a public env var so the client cannot resolve ownership itself. A static
 * segment takes precedence over the [...all] catch-all next to it.
 */
export async function GET() {
  const session = await getSession();
  return NextResponse.json({
    authenticated: !!session,
    role: session?.role ?? null,
    name: session?.name ?? null,
    email: session?.email ?? null,
    isOwner: isOwner(session),
  });
}
