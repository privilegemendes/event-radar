import { db } from "@/lib/db";

/**
 * Whether this user may act on the SHARED catalogue.
 *
 * Its own module, free of the `server-only` chain that settings.ts pulls in, so
 * it can be exercised outside Next — the same reason auth-error.ts and
 * profile-schema.ts sit apart from their callers.
 *
 * Read from the database rather than taken from the token, because a role is
 * not a claim a client should be able to assert. Anything that fails — an
 * unknown user, an unreadable row — leaves this FALSE: an admin tool that
 * appears when the lookup breaks is worse than one that never appears.
 */
export async function isAdminUser(userId: string): Promise<boolean> {
  try {
    const u = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
    return u?.role === "ADMIN";
  } catch {
    return false;
  }
}
