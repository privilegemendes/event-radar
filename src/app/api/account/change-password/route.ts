import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireSession, authErrorResponse } from "@/lib/session";

/**
 * Change the signed-in user's password.
 *
 * Wraps Better Auth's own changePassword rather than replacing it, because the
 * app carries one thing Better Auth does not know about: `mustChangePassword`,
 * the flag behind the "default password" banner. Better Auth would rotate the
 * credential and leave the banner up forever.
 *
 * Deliberately NOT mounted at /api/auth/change-password: a static segment wins
 * over the [...all] catch-all, so that path would silently shadow Better Auth's
 * own endpoint of the same name.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const { currentPassword, newPassword } = (await request.json()) as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "currentPassword and newPassword are required" }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
    }

    try {
      await auth.api.changePassword({
        body: { currentPassword, newPassword, revokeOtherSessions: true },
        headers: await headers(),
      });
    } catch {
      // Better Auth does not distinguish a wrong current password from other
      // failures here; keep the message the old route used.
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
    }

    await db.user.update({
      where: { id: session.userId },
      data: { mustChangePassword: false },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error("Change password error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
