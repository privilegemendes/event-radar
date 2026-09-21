import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, authErrorResponse } from "@/lib/session";
import { isAutoDiscoveryEnabled, setSetting, SETTINGS_KEYS } from "@/lib/settings";
import { db } from "@/lib/db";

export async function GET() {
  try {
    await requireAdmin();
    const enabled = await isAutoDiscoveryEnabled();
    const lastRun = await db.discoveryRun.findFirst({ orderBy: { startedAt: "desc" } });
    return NextResponse.json({ enabled, lastRun });
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    await setSetting(SETTINGS_KEYS.autoDiscovery, body.enabled === false ? "false" : "true");
    return NextResponse.json({ enabled: body.enabled !== false });
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
