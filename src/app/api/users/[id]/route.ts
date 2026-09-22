import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, authErrorResponse } from "@/lib/session";
import { checkRoleChange, isNoop, isRole, type Role } from "@/lib/role-change";

/**
 * Change a user's role.
 *
 * Admin-only, and it refuses two changes that would lock the workspace out —
 * an admin demoting themselves, and demoting the last admin. Both rules live in
 * src/lib/role-change.ts so they can be tested without a database.
 *
 * The admin count is read inside the same transaction as the write. Read it
 * outside and two admins demoting each other at once can both see a count of
 * two, both pass the check, and leave zero admins behind.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as { role?: unknown };

    if (!isRole(body.role)) {
      return NextResponse.json({ error: "Role must be ADMIN or MEMBER" }, { status: 400 });
    }
    const nextRole: Role = body.role;

    const result = await db.$transaction(async (tx) => {
      const target = await tx.user.findUnique({
        where: { id },
        select: { id: true, email: true, name: true, role: true },
      });
      if (!target) return { error: "User not found", status: 404 as const };

      const adminCount = await tx.user.count({ where: { role: "ADMIN" } });
      const targetCurrentRole = (target.role === "ADMIN" ? "ADMIN" : "MEMBER") as Role;

      const verdict = checkRoleChange({
        actorId: session.userId,
        targetId: target.id,
        targetCurrentRole,
        nextRole,
        adminCount,
      });
      if (!verdict.allowed) return { error: verdict.reason!, status: verdict.status ?? 409 as const };

      if (isNoop({ targetCurrentRole, nextRole })) return { user: { ...target, role: nextRole } };

      const updated = await tx.user.update({
        where: { id },
        data: { role: nextRole },
        select: { id: true, email: true, name: true, role: true, mustChangePassword: true, createdAt: true },
      });
      return { user: updated };
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.user);
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error("Role change failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
