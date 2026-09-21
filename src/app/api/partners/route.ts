import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, authErrorResponse } from "@/lib/session";

export async function GET() {
  try {
    // Public read: viewing is open.
    const partners = await db.partner.findMany({
      include: { _count: { select: { events: true } } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(partners);
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const body = await request.json();
    const partner = await db.partner.create({
      data: {
        name: body.name,
        category: body.category,
        stage: body.stage,
        stageStatus: body.stageStatus ?? "",
        country: body.country ?? "",
        keyContact: body.keyContact ?? "",
        notes: body.notes ?? "",
        region: body.region ?? null,
        tier: body.tier ?? null,
      },
    });

    return NextResponse.json(partner, { status: 201 });
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
