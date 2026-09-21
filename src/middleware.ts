import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Redirect-only gate.
 *
 * This checks that a session cookie EXISTS; it does not validate it. Better
 * Auth is explicit that the cookie check is not an authorization mechanism, and
 * validating here would mean a database round-trip on essentially every request
 * (the matcher below covers nearly the whole app).
 *
 * Authorization therefore lives where it can be enforced properly:
 *   • API routes call requireSession() / requireAdmin(), which read and verify
 *     the session server-side.
 *   • /podiums is owner-only and re-checks server-side in its own layout —
 *     middleware only saves an anonymous visitor a wasted round-trip.
 *
 * A forged cookie gets a redirect it would not otherwise get, and nothing else.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const requiresAuth =
    pathname.startsWith("/podiums") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/change-password");

  if (requiresAuth && !getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"],
};
