import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifySessionToken } from "./jwt";
export type { Session } from "./jwt";

/**
 * Thrown by the guards below, carrying the HTTP status the route should answer
 * with. Route handlers map it via authErrorResponse() instead of each one
 * re-deciding what "not allowed" means — 16 of them used to do that inline, and
 * they had already drifted (one route answered 403 to an anonymous caller where
 * every other route answered 401).
 *
 * The `message` values are deliberately unchanged from the strings the old
 * inline checks threw and returned, so any caller still comparing on
 * `err.message === "Not authenticated"` keeps working.
 */
export class AuthError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Any signed-in user. Throws AuthError(401) otherwise. */
export async function requireSession() {
  const session = await getSession();
  if (!session) throw new AuthError("Not authenticated", 401);
  return session;
}

/** Signed in AND ADMIN. Throws AuthError(401) or AuthError(403). */
export async function requireAdmin() {
  const session = await requireSession();
  if (session.role !== "ADMIN") throw new AuthError("Forbidden", 403);
  return session;
}

/**
 * Turn a thrown AuthError into the response for it; returns null for anything
 * else so the caller can fall through to its own 500 handling.
 */
export function authErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return null;
}
