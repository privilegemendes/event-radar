import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Files in `public/` are served from the root, not from `/public/…` — so
 * `public/logo.svg` is requested as `/logo.svg` and is caught by the gate
 * below like any page would be. An <img> on the sign-in page then resolves to
 * a 307 at the login screen instead of the image, and renders broken.
 *
 * Anything with a file extension is a static asset, never a page route in this
 * app. These are public by nature: a logo and the map's geojson.
 */
function isPublicAsset(pathname: string): boolean {
  return /\.[a-zA-Z0-9]+$/.test(pathname);
}

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
    pathname === "/signup" ||
    pathname.startsWith("/api/auth") ||
    /* OAuth discovery. RFC 9728 and RFC 8414 REQUIRE these at the origin root,
       and a client fetches them before it has any credentials — redirecting
       them to /login makes the app undiscoverable to an MCP connector, which
       reads the HTML and fails. */
    pathname.startsWith("/.well-known/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    isPublicAsset(pathname)
  ) {
    return NextResponse.next();
  }

  /* API routes are never redirected. They enforce their own guards and answer
     401 with JSON; a redirect would send a fetch() to an HTML login page, which
     it would then fail to parse — a confusing error instead of a clear one. */
  if (pathname.startsWith("/api/")) return NextResponse.next();

  /* Every page requires a session now — reads are no longer public. The
     always-public paths above (login, /api/auth, static assets) are the only
     exceptions, so anything reaching here is app UI.

     Still only a cookie-existence check, not validation: this is a redirect
     hint that saves an anonymous visitor a wasted round trip. Authorization is
     enforced server-side in the API routes and in the owner-only Podium
     layout. */
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
