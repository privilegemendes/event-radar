import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { getApplicantProfile, setSetting, SETTINGS_KEYS, EMPTY_PROFILE } from "@/lib/settings";

export async function GET() {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(await getApplicantProfile());
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await request.json();
    // Only persist known keys.
    const clean: Record<string, string> = {};
    for (const key of Object.keys(EMPTY_PROFILE)) {
      clean[key] = typeof body[key] === "string" ? body[key] : "";
    }
    await setSetting(SETTINGS_KEYS.applicantProfile, JSON.stringify(clean));
    return NextResponse.json(clean);
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
