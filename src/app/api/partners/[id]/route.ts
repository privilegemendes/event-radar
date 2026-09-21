import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, authErrorResponse } from "@/lib/session";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await request.json();

    const partner = await db.partner.update({
      where: { id },
      data: {
        name: body.name,
        category: body.category,
        stage: body.stage,
        stageStatus: body.stageStatus,
        country: body.country,
        keyContact: body.keyContact,
        notes: body.notes,
        region: body.region ?? null,
        tier: body.tier ?? null,
      },
    });
    return NextResponse.json(partner);
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    await db.partner.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
