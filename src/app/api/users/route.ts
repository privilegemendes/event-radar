import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, authErrorResponse } from "@/lib/session";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

export async function GET() {
  try {
    await requireAdmin();
    const users = await db.user.findMany({
      select: { id: true, email: true, name: true, role: true, mustChangePassword: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(users);
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const body = await request.json() as {
      email: string;
      name: string;
      password: string;
      role: "ADMIN" | "MEMBER";
    };

    if (!body.email || !body.name || !body.password) {
      return NextResponse.json({ error: "email, name, and password are required" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    /* Better Auth keeps credentials in the `account` table, not on the user
       row, so creating a user without one would leave them unable to sign in.
       Both rows go in one transaction — a user with no credential account is
       a broken account, not a partial one.

       `role` is set here rather than through Better Auth's sign-up: the field
       is `input: false` in the auth config precisely so a caller cannot make
       itself an ADMIN by posting a role. This path is already admin-gated. */
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: body.email.toLowerCase(),
          name: body.name,
          role: body.role ?? "MEMBER",
          mustChangePassword: true,
        },
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      });
      await tx.account.create({
        data: {
          id: randomUUID(),
          accountId: created.id,
          providerId: "credential",
          userId: created.id,
          password: passwordHash,
          updatedAt: new Date(),
        },
      });
      return created;
    });

    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
