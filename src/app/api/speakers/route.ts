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
    if (err instanceof Error && err.message === "Not authenticated")
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
