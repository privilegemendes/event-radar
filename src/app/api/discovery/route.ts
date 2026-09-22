import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, requireAdmin, authErrorResponse } from "@/lib/session";
import { runDiscovery } from "@/lib/discovery";

export const maxDuration = 300;

export async function GET() {
  try {
    await requireSession();
    const lastRun = await db.discoveryRun.findFirst({ orderBy: { startedAt: "desc" } });
    return NextResponse.json(lastRun);
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
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
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error("Discovery error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
