/**
 * Rules for changing a user's role.
 *
 * Pure and free of Prisma, so the cases that matter — the ones that can lock
 * everybody out — are unit-tested without a database.
 */

export type Role = "ADMIN" | "MEMBER";

export interface RoleChangeRequest {
  /** The admin making the change. */
  actorId: string;
  /** The user whose role is changing. */
  targetId: string;
  targetCurrentRole: Role;
  nextRole: Role;
  /** How many ADMINs exist right now, counting the target. */
  adminCount: number;
}

export interface RoleChangeVerdict {
  allowed: boolean;
  /** Message for the API response; null when allowed. */
  reason: string | null;
  status?: number;
}

export const ROLES: readonly Role[] = ["ADMIN", "MEMBER"];

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

/**
 * Decide whether a role change may proceed.
 *
 * Two refusals, and both exist to prevent a locked-out workspace rather than to
 * express a hierarchy:
 *
 *   - An admin cannot demote themselves. It is the single most likely
 *     misclick on this screen, it takes effect on their very next request, and
 *     the only way back is another admin or a database console.
 *   - The last admin cannot be demoted by anyone. Zero admins means nobody can
 *     manage users, run discovery, or promote anyone ever again.
 *
 * Demoting a *different* admin while others remain is allowed: that is the
 * legitimate case this screen exists for.
 */
export function checkRoleChange(req: RoleChangeRequest): RoleChangeVerdict {
  if (!isRole(req.nextRole)) {
    return { allowed: false, reason: "Role must be ADMIN or MEMBER", status: 400 };
  }

  if (req.nextRole === req.targetCurrentRole) {
    // Not an error — just nothing to do. The caller can skip the write.
    return { allowed: true, reason: null };
  }

  const isDemotion = req.targetCurrentRole === "ADMIN" && req.nextRole === "MEMBER";

  if (isDemotion && req.actorId === req.targetId) {
    return {
      allowed: false,
      reason: "You cannot remove your own admin role. Ask another admin to do it.",
      status: 409,
    };
  }

  if (isDemotion && req.adminCount <= 1) {
    return {
      allowed: false,
      reason: "This is the last admin. Promote someone else first.",
      status: 409,
    };
  }

  return { allowed: true, reason: null };
}

/** True when the change is a no-op and the database write can be skipped. */
export function isNoop(req: Pick<RoleChangeRequest, "targetCurrentRole" | "nextRole">): boolean {
  return req.targetCurrentRole === req.nextRole;
}
