import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    // Public read: viewing is open.
    const speakers = await db.speaker.findMany({
      orderBy: [{ talkCount: "desc" }, { name: "asc" }],
    });
    return NextResponse.json(speakers);
  } catch (err) {
    // Fully public read — no session call here, so no auth error is possible.
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
