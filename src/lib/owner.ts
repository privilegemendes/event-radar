import type { Session } from "./jwt";

/**
 * The single "owner" of this workspace — private content (the Podium page and
 * any event matching the profile's privateKeywords) is visible only to this
 * user, even though other admins (e.g. reviewers) exist. Enforced server-side.
 *
 * Set OWNER_EMAIL to re-point the app at a different person. The fallback keeps
 * existing deployments working until the env var is set.
 */
export const OWNER_EMAIL = (process.env.OWNER_EMAIL ?? "irmak@coder.com").toLowerCase();

export function isOwner(session: Pick<Session, "email"> | null | undefined): boolean {
  return !!session?.email && session.email.toLowerCase() === OWNER_EMAIL;
}
