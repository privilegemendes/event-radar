"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import EventAvatar from "@/components/EventAvatar";
import { EVENT_TYPE_STYLES, ACTION_STYLES, ACTION_LABELS } from "@/lib/constants";

interface CoderEvent {
  id: string;
  title: string;
  type: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  isOnline: boolean;
  region: string | null;
  suggestedAction: string | null;
  url: string | null;
  isCoderEvent: boolean;
}

const EMEA_REGIONS = new Set(["Amsterdam/NL", "Rest of Europe", "London/UK"]);

function fmtDate(d: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-GB", opts ?? { day: "numeric", month: "short", year: "numeric" });
}

function dateRange(ev: CoderEvent): string {
  if (!ev.startDate) return "Date TBD";
  const s = fmtDate(ev.startDate, { weekday: "short", day: "numeric", month: "short" });
  if (!ev.endDate || ev.endDate === ev.startDate) return s ?? "";
  const eYear = new Date(ev.endDate).getFullYear();
  const sYear = new Date(ev.startDate).getFullYear();
  const e = fmtDate(ev.endDate, eYear !== sYear
    ? { day: "numeric", month: "short", year: "numeric" }
    : { day: "numeric", month: "short" });
  return `${s} – ${e}`;
}

function monthKey(ev: CoderEvent): string {
  if (!ev.startDate) return "Date TBD";
  return new Date(ev.startDate).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function groupByMonth(events: CoderEvent[]): [string, CoderEvent[]][] {
  const map = new Map<string, CoderEvent[]>();
  for (const ev of events) {
    const k = monthKey(ev);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(ev);
  }
  return Array.from(map.entries());
}

export default function CoderEventsPage() {
  const router = useRouter();
  const [events,  setEvents]  = useState<CoderEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/events?isCoderEvent=true")
      .then((r) => r.json())
      .then((d: CoderEvent[]) => {
        if (!Array.isArray(d)) return;
        // Sort by startDate asc, nulls last
        const sorted = [...d].sort((a, b) => {
          if (!a.startDate && !b.startDate) return 0;
          if (!a.startDate) return 1;
          if (!b.startDate) return -1;
          return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
        });
        setEvents(sorted);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const emeaCount = events.filter((ev) => ev.region && EMEA_REGIONS.has(ev.region)).length;
  const groups    = groupByMonth(events);

  return (
    <div className="max-w-5xl mx-auto">

      {/* Header */}
      <div className="relative mb-7">
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-8 rounded-2xl"
          style={{ background: "radial-gradient(ellipse 500px 180px at 40% 50%, rgba(188,124,255,0.07) 0%, transparent 70%)" }}
        />
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">Coder Events</h1>
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/30 mt-1">
              Official Coder event schedule — awareness &amp; networking
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="font-mono text-2xl font-bold text-[#BC7CFF]">{events.length}</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/30">Total events</span>
            {emeaCount > 0 && (
              <span className="font-mono text-[9px] text-[#BC7CFF]/70">
                {emeaCount} EMEA (you can join)
              </span>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 p-3 bg-[#BC7CFF]/5 border border-[#BC7CFF]/15 rounded-xl">
          <div className="flex items-center gap-2">
            <div className="w-0.5 h-6 bg-[#BC7CFF] rounded-full flex-shrink-0" />
            <span className="font-mono text-[9px] text-white/50">
              Purple border = EMEA event (Amsterdam/NL, Rest of Europe, or London/UK) — you can realistically join or speak
            </span>
          </div>
        </div>
      </div>

      {/* Event list */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-white/30 font-mono text-sm">Loading…</div>
      ) : events.length === 0 ? (
        <div className="text-center py-20 text-white/25">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em]">No Coder events scheduled</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(([month, monthEvents]) => (
            <section key={month}>
              {/* Month header */}
              <div className="flex items-center gap-3 mb-3">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.15em] text-white/40">{month}</h2>
                <span className="font-mono text-[9px] text-white/20">{monthEvents.length}</span>
                <div className="flex-1 h-px bg-white/[0.05]" />
              </div>

              {/* Events in this month */}
              <div className="space-y-1.5">
                {monthEvents.map((ev) => {
                  const isEMEA = ev.region != null && EMEA_REGIONS.has(ev.region);
                  return (
                    <div
                      key={ev.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(`/events/${ev.id}`)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") router.push(`/events/${ev.id}`); }}
                      className={`group flex items-center gap-3 bg-[#101314] hover:bg-[#141718] border rounded-xl px-4 py-3 transition-all duration-150 cursor-pointer ${
                        isEMEA
                          ? "border-l-[3px] border-l-[#BC7CFF]/60 border-r-white/[0.07] border-y-white/[0.07] hover:border-l-[#BC7CFF]"
                          : "border-white/[0.07] hover:border-white/[0.12]"
                      }`}
                    >
                      {/* Avatar */}
                      <EventAvatar event={ev} size={32} />

                      {/* Title + date + location */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                          <span className={`font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded ${EVENT_TYPE_STYLES[ev.type] ?? "bg-white/5 text-white/40"}`}>
                            {ev.type}
                          </span>
                          {ev.suggestedAction && ACTION_STYLES[ev.suggestedAction] && (
                            <span className={`font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded ${ACTION_STYLES[ev.suggestedAction]}`}>
                              {ACTION_LABELS[ev.suggestedAction] ?? ev.suggestedAction}
                            </span>
                          )}
                          <span className="font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-[#BC7CFF]/15 text-[#BC7CFF] border border-[#BC7CFF]/30">
                            CODER
                          </span>
                          {ev.region && (
                            <span className={`font-mono text-[9px] ${isEMEA ? "text-[#BC7CFF]/60" : "text-white/30"}`}>
                              {ev.region}
                            </span>
                          )}
                        </div>
                        <h3 className="font-medium text-white/90 group-hover:text-white transition-colors text-sm leading-snug">
                          {ev.title}
                        </h3>
                      </div>

                      {/* Date + location (right) */}
                      <div className="flex-shrink-0 text-right">
                        <p className="font-mono text-[10px] text-white/50">{dateRange(ev)}</p>
                        {ev.location && (
                          <p className="font-mono text-[9px] text-white/30 mt-0.5">{ev.location}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
