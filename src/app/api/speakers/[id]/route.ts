import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;

    const data: Record<string, unknown> = {};
    for (const f of ["name", "title", "company", "linkedinUrl", "background", "topics", "region", "outreachNote"])
      if (f in body) data[f] = body[f] ?? null;

    const updated = await db.speaker.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated")
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    await db.speaker.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated")
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
