import { headers } from "next/headers";
import { auth } from "./auth";
import { AuthError } from "./auth-error";

export { AuthError, authErrorResponse } from "./auth-error";

/**
 * The app's session shape and guards.
 *
 * Backed by Better Auth since the migration, but the exported API is unchanged
 * so the 24 route guards consolidated in the previous change did not have to
 * move again — that consolidation is the reason this swap touches one file
 * instead of twenty-one.
 */
export interface Session {
  userId: string;
  email: string;
  name: string;
  role: "ADMIN" | "MEMBER";
  mustChangePassword: boolean;
}

export async function getSession(): Promise<Session | null> {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result?.user) return null;
  const user = result.user as typeof result.user & {
    role?: string | null;
    mustChangePassword?: boolean | null;
  };
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    // Falls back to the least-privileged role rather than assuming ADMIN if the
    // column is ever missing or unreadable.
    role: user.role === "ADMIN" ? "ADMIN" : "MEMBER",
    mustChangePassword: user.mustChangePassword === true,
  };
}

/** Any signed-in user. Throws AuthError(401) otherwise. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new AuthError("Not authenticated", 401);
  return session;
}

/** Signed in AND ADMIN. Throws AuthError(401) or AuthError(403). */
export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== "ADMIN") throw new AuthError("Forbidden", 403);
  return session;
}
