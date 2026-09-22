import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, authErrorResponse } from "@/lib/session";
import { db } from "@/lib/db";
import { getCalendarIcsUrl, setSetting, SETTINGS_KEYS, maskUrl } from "@/lib/settings";

/** Returns whether a calendar is configured and a masked preview — never the raw secret URL. */
export async function GET() {
  try {
    await requireAdmin();
    const url = await getCalendarIcsUrl();
    const fromEnv = !!process.env.WORK_CALENDAR_ICS_URL;
    return NextResponse.json({ configured: !!url, masked: maskUrl(url), fromEnv });
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
    const url = (body.url ?? "").trim();
    if (url && !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "URL must start with http(s)://" }, { status: 400 });
    }
    await setSetting(SETTINGS_KEYS.calendarIcsUrl, url);
    return NextResponse.json({ configured: !!url, masked: maskUrl(url || null) });
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await requireAdmin();
    await db.appSetting.deleteMany({ where: { key: SETTINGS_KEYS.calendarIcsUrl } });
    return NextResponse.json({ configured: false });
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
