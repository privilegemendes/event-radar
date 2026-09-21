import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { isAutoDiscoveryEnabled, setSetting, SETTINGS_KEYS } from "@/lib/settings";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const enabled = await isAutoDiscoveryEnabled();
    const lastRun = await db.discoveryRun.findFirst({ orderBy: { startedAt: "desc" } });
    return NextResponse.json({ enabled, lastRun });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated")
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await request.json();
    await setSetting(SETTINGS_KEYS.autoDiscovery, body.enabled === false ? "false" : "true");
    return NextResponse.json({ enabled: body.enabled !== false });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated")
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
