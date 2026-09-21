import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { getCalendarIcsUrl } from "@/lib/settings";
import { parseIcsBusy, checkAvailability, type BusyInterval } from "@/lib/ics";

export const dynamic = "force-dynamic";

/** Short in-memory cache so we don't refetch the ICS on every event. */
let cache: { url: string; at: number; busy: BusyInterval[] } | null = null;
const TTL_MS = 5 * 60 * 1000;
/** Upper bound on items per availability request; see the POST handler. */
const MAX_ITEMS = 1000;

async function loadBusy(url: string): Promise<BusyInterval[]> {
  if (cache && cache.url === url && Date.now() - cache.at < TTL_MS) {
    return cache.busy;
  }
  const res = await fetch(url, { headers: { Accept: "text/calendar" }, cache: "no-store" });
  if (!res.ok) throw new Error(`ICS fetch failed: ${res.status}`);
  const text = await res.text();
  const busy = parseIcsBusy(text);
  cache = { url, at: Date.now(), busy };
  return busy;
}

async function requireAdmin() {
  const session = await requireSession();
  if (session.role !== "ADMIN") throw new Error("Forbidden");
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const url = await getCalendarIcsUrl();
    if (!url) return NextResponse.json({ configured: false, status: "unknown", conflicts: [] });

    const { searchParams } = new URL(request.url);
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");
    if (!startParam) return NextResponse.json({ configured: true });

    const busy = await loadBusy(url);
    const start = new Date(startParam).getTime();
    const end = endParam ? new Date(endParam).getTime() : null;
    const result = checkAvailability(busy, isNaN(start) ? null : start, end && !isNaN(end) ? end : null);
    return NextResponse.json({ configured: true, ...result });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (err instanceof Error && err.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error(err);
    return NextResponse.json({ configured: true, status: "unknown", conflicts: [], error: "calendar_unavailable" });
  }
}

/** Batch: body { items: [{ id, start, end? }] } → { configured, results: { [id]: {status, conflicts} } }. */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const url = await getCalendarIcsUrl();
    if (!url) return NextResponse.json({ configured: false, results: {} });

    const body = await request.json();
    const items: { id: string; start: string | null; end?: string | null }[] = Array.isArray(body.items)
      ? body.items
      : [];
    // The dashboard sends one item per displayed event and that list is
    // unpaginated, so the array is caller-controlled and grows with the corpus.
    // Truncate rather than reject: an id missing from `results` already renders
    // no chip, so this degrades quietly instead of failing the whole request.
    const capped = items.slice(0, MAX_ITEMS);
    const busy = await loadBusy(url);
    const results: Record<string, ReturnType<typeof checkAvailability>> = {};
    for (const it of capped) {
      const start = it.start ? new Date(it.start).getTime() : NaN;
      const end = it.end ? new Date(it.end).getTime() : NaN;
      results[it.id] = checkAvailability(busy, isNaN(start) ? null : start, isNaN(end) ? null : end);
    }
    return NextResponse.json({ configured: true, results });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (err instanceof Error && err.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error(err);
    return NextResponse.json({ configured: true, results: {}, error: "calendar_unavailable" });
  }
}
