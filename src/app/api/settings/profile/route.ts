import { NextRequest, NextResponse } from "next/server";
import { requireSession, authErrorResponse } from "@/lib/session";
import { getApplicantProfile, setApplicantProfile, EMPTY_PROFILE } from "@/lib/settings";
import type { ApplicantProfile } from "@/lib/profile-schema";

/**
 * A speaker's own brief.
 *
 * Both handlers pass session.userId. Without it `getApplicantProfile()` and
 * `setApplicantProfile()` fall back to the OWNER's row — so every admin was
 * shown Irmak's brief as their own, and saving the form would have overwritten
 * hers. Phase 2 was meant to pass the session user here and missed this route.
 *
 * requireSession, not requireAdmin: a speaker who cannot edit their own brief
 * can never be scored meaningfully, and scoring is deliberately open to
 * MEMBERs. Each handler now touches only the caller's own row, so this widens
 * who can edit a brief while narrowing whose brief they can reach.
 */
export async function GET() {
  try {
    const session = await requireSession();
    return NextResponse.json(await getApplicantProfile(session.userId));
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = await request.json();

    /* Only persist known keys — a caller must not be able to write arbitrary
       columns by posting extra fields. */
    const clean = { ...EMPTY_PROFILE };
    for (const key of Object.keys(EMPTY_PROFILE) as (keyof ApplicantProfile)[]) {
      clean[key] = typeof body[key] === "string" ? body[key] : "";
    }

    return NextResponse.json(await setApplicantProfile(clean, session.userId));
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
