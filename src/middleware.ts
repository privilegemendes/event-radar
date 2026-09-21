import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/jwt";
import { OWNER_EMAIL } from "@/lib/owner";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always-public routes
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // The Podium is private to the owner only.
  if (pathname.startsWith("/podiums")) {
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySessionToken(token) : null;
    if (!session) {
      const response = NextResponse.redirect(new URL("/login", request.url));
      if (token) response.cookies.delete("session");
      return response;
    }
    if (session.email?.toLowerCase() !== OWNER_EMAIL) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // Admin-only areas still require a valid session (pages redirect to login).
  // Everything else is open for VIEWING; mutating API routes enforce admin themselves.
  const requiresAuth =
    pathname.startsWith("/settings") ||
    pathname.startsWith("/change-password");

  if (requiresAuth) {
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySessionToken(token) : null;
    if (!session) {
      const response = NextResponse.redirect(new URL("/login", request.url));
      if (token) response.cookies.delete("session");
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};
