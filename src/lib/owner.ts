import type { Session } from "./jwt";

/**
 * The single "owner" of this workspace — private content (nomad-related events,
 * the Podium page) is visible only to this user, even though other admins
 * (e.g. reviewers) exist. Kept as a constant so it is enforced server-side.
 */
export const OWNER_EMAIL = "irmak@coder.com";

export function isOwner(session: Pick<Session, "email"> | null | undefined): boolean {
  return !!session?.email && session.email.toLowerCase() === OWNER_EMAIL;
}

/** True when an event should be hidden from everyone except the owner. */
export function isNomadEvent(e: {
  title?: string | null;
  description?: string | null;
  industry?: string | null;
  audienceDescription?: string | null;
  sourceNote?: string | null;
}): boolean {
  const hay = [e.title, e.description, e.industry, e.audienceDescription, e.sourceNote]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  // Match digital-nomad / nomad-lifestyle events, NOT the HashiCorp "Nomad" product.
  return /digital nomad|nomad cruise|nomad world|nomad week|nomad fest|nomad conference|nomad summit|nomad retreat|athens nomad|nomad\u00e9ire|nomad\s+(?:festival|gathering|village)|nomadic|remote year|\bnomads?\b(?=.*(?:founder|entrepreneur|remote|travel|lifestyle|cruise|fest|retreat))/.test(hay);
}
