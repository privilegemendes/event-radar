import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { getCalendarIcsUrl, setSetting, SETTINGS_KEYS, maskUrl } from "@/lib/settings";

/** Returns whether a calendar is configured and a masked preview — never the raw secret URL. */
export async function GET() {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const url = await getCalendarIcsUrl();
    const fromEnv = !!process.env.WORK_CALENDAR_ICS_URL;
    return NextResponse.json({ configured: !!url, masked: maskUrl(url), fromEnv });
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
    const url = (body.url ?? "").trim();
    if (url && !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "URL must start with http(s)://" }, { status: 400 });
    }
    await setSetting(SETTINGS_KEYS.calendarIcsUrl, url);
    return NextResponse.json({ configured: !!url, masked: maskUrl(url || null) });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await db.appSetting.deleteMany({ where: { key: SETTINGS_KEYS.calendarIcsUrl } });
    return NextResponse.json({ configured: false });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
