import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, authErrorResponse } from "@/lib/session";
import bcrypt from "bcryptjs";

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
    const user = await db.user.create({
      data: {
        email: body.email.toLowerCase(),
        name: body.name,
        passwordHash,
        role: body.role ?? "MEMBER",
        mustChangePassword: true,
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
