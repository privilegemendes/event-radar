import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, authErrorResponse } from "@/lib/session";

export async function GET() {
  try {
    await requireSession();
    const speakers = await db.speaker.findMany({
      orderBy: [{ talkCount: "desc" }, { name: "asc" }],
    });
    return NextResponse.json(speakers);
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
