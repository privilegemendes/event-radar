import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, authErrorResponse } from "@/lib/session";
import { getApplicantProfile, setSetting, SETTINGS_KEYS, EMPTY_PROFILE } from "@/lib/settings";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(await getApplicantProfile());
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
    // Only persist known keys.
    const clean: Record<string, string> = {};
    for (const key of Object.keys(EMPTY_PROFILE)) {
      clean[key] = typeof body[key] === "string" ? body[key] : "";
    }
    await setSetting(SETTINGS_KEYS.applicantProfile, JSON.stringify(clean));
    return NextResponse.json(clean);
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
