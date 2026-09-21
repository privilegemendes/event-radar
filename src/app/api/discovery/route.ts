import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { runDiscovery } from "@/lib/discovery";

export const maxDuration = 300;

export async function GET() {
  try {
    // Public read: last discovery run is viewable without login.
    const lastRun = await db.discoveryRun.findFirst({ orderBy: { startedAt: "desc" } });
    return NextResponse.json(lastRun);
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated")
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json().catch(() => ({})) as { partnerId?: string; focus?: string; broad?: boolean };
    const result = await runDiscovery({ partnerId: body.partnerId, focus: body.focus, broad: body.broad });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, runId: result.runId },
        { status: result.status ?? 500 },
      );
    }
    return NextResponse.json({ ok: true, runId: result.runId, found: result.found, total: result.total });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated")
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    console.error("Discovery error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
