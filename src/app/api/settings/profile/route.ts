import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, authErrorResponse } from "@/lib/session";
import { getApplicantProfile, setApplicantProfile, EMPTY_PROFILE } from "@/lib/settings";
import type { ApplicantProfile } from "@/lib/profile-schema";

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

    /* Only persist known keys — a caller must not be able to write arbitrary
       columns by posting extra fields. */
    const clean = { ...EMPTY_PROFILE };
    for (const key of Object.keys(EMPTY_PROFILE) as (keyof ApplicantProfile)[]) {
      clean[key] = typeof body[key] === "string" ? body[key] : "";
    }

    /* No userId: Phase 0 still writes the owner's profile, which is the only
       one that exists. Phase 2 passes session.userId here. */
    return NextResponse.json(await setApplicantProfile(clean));
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
