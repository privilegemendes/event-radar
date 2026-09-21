"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EVENT_TYPE_DOT } from "@/lib/constants";

interface PartnerBasic { id: string; name: string; }

interface Event {
  id: string;
  title: string;
  type: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  isOnline: boolean;
  coderRelevant: boolean;
  partnerId: string | null;
  partner: { id: string; name: string; category: string | null } | null;
  isCoderEvent: boolean;
}

const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const selCls = "px-3 py-1.5 bg-coder-control border border-white/10 rounded-lg text-sm text-white/70 focus:outline-none focus:border-coder-purple transition-colors";

export default function CalendarPage() {
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [partners,  setPartners]  = useState<PartnerBasic[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [today]                   = useState(() => new Date());
  const [year,  setYear]          = useState(() => new Date().getFullYear());
  const [month, setMonth]         = useState(() => new Date().getMonth());

  // Partner filter — same two-stage control as Overview
  const [partnerMode,     setPartnerMode]     = useState(""); // "" | "partner" | "community"
  const [partnerIdFilter, setPartnerIdFilter] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/events?view=calendar").then((r) => r.json()),
      fetch("/api/partners").then((r) => r.json()),
    ])
      .then(([evs, pts]: [Event[], PartnerBasic[]]) => {
        setAllEvents(Array.isArray(evs) ? evs : []);
        setPartners(Array.isArray(pts) ? pts : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handlePartnerMode = (val: string) => {
    setPartnerMode(val);
    if (val !== "partner") setPartnerIdFilter("");
  };

  // Apply partner filter to full event list
  const events = allEvents.filter((ev) => {
    if (partnerMode === "partner") {
      if (!ev.partner) return false;
      if (partnerIdFilter && ev.partnerId !== partnerIdFilter) return false;
    }
    if (partnerMode === "community" && ev.partner) return false;
    if (partnerMode === "coder" && !ev.isCoderEvent) return false;
    if (partnerMode === "techAlliance" && ev.partner?.category !== "Tech Alliance") return false;
    return true;
  });

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const eventsOnDay = (day: number) =>
    events.filter((ev) => {
      if (!ev.startDate) return false;
      const cell  = new Date(year, month, day);
      const start = new Date(ev.startDate); start.setHours(0,0,0,0);
      const end   = ev.endDate ? new Date(ev.endDate) : start;
      end.setHours(23,59,59,999);
      return cell >= start && cell <= end;
    });

  const datelessEvents = events.filter((ev) => !ev.startDate && ev.status !== "REJECTED");
  const monthCount = events.filter((ev) => {
    if (!ev.startDate) return false;
    const d = new Date(ev.startDate);
    return d.getFullYear() === year && d.getMonth() === month;
  }).length;

  const isToday = (day: number) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

  const hasFilter = partnerMode || partnerIdFilter;

  return (
    <div className="max-w-5xl mx-auto">

      {/* Header row */}
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-white">Calendar</h1>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/30 mt-1">Events by start date</p>
        </div>

        {/* Month navigation */}
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.05] transition-colors" aria-label="Previous month">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 2L4 7l5 5"/>
            </svg>
          </button>
          <span className="font-mono text-sm font-medium text-white min-w-40 text-center tracking-wide">
            {MONTHS[month]} {year}
          </span>
          <button onClick={nextMonth} className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.05] transition-colors" aria-label="Next month">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 2l5 5-5 5"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Partner filter row */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={partnerMode} onChange={(e) => handlePartnerMode(e.target.value)} className={selCls}>
          <option value="">All events</option>
          <option value="partner">Partner events</option>
          <option value="community">Community events</option>
          <option value="coder">Coder events</option>
          <option value="techAlliance">Tech Alliance events</option>
        </select>

        {partnerMode === "partner" && (
          <select value={partnerIdFilter} onChange={(e) => setPartnerIdFilter(e.target.value)} className={selCls}>
            <option value="">All partners</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}

        {hasFilter && (
          <button
            onClick={() => { setPartnerMode(""); setPartnerIdFilter(""); }}
            className="px-3 py-1.5 text-xs text-white/40 hover:text-white border border-white/10 hover:border-white/20 rounded-lg transition-colors"
          >
            Clear filter
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-60 text-white/30 font-mono text-sm">Loading…</div>
      ) : (
        <div className="bg-coder-panel border border-white/[0.08] rounded-xl overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-white/[0.07]">
            {DAYS.map((d) => (
              <div key={d} className="text-center py-3 font-mono text-[9px] uppercase tracking-[0.12em] text-white/30">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {cells.map((day, idx) => {
              const dayEvents = day ? eventsOnDay(day) : [];
              return (
                <div
                  key={idx}
                  className={`min-h-24 p-1.5 border-r border-b border-white/[0.05] ${idx % 7 === 6 ? "border-r-0" : ""} ${!day ? "bg-coder-bg/60" : ""}`}
                >
                  {day && (
                    <>
                      <div className="mb-1 flex justify-start">
                        <span className={`font-mono text-xs w-7 h-7 flex items-center justify-center rounded-full ${
                          isToday(day) ? "bg-coder-purple text-black font-bold ring-2 ring-coder-purple/40" : "text-white/40"
                        }`}>
                          {day}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 3).map((ev) => (
                          <Link key={ev.id} href={`/events/${ev.id}`} className="flex items-center gap-1 group">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${EVENT_TYPE_DOT[ev.type] ?? "bg-white/30"}`} />
                            <span className="text-[10px] text-white/40 group-hover:text-white/80 truncate leading-tight transition-colors">
                              {ev.title}
                            </span>
                          </Link>
                        ))}
                        {dayEvents.length > 3 && (
                          <span className="font-mono text-[9px] text-white/20">+{dayEvents.length - 3} more</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend + filter summary */}
      <div className="flex flex-wrap items-center justify-between gap-4 mt-4">
        <div className="flex flex-wrap gap-4">
          {Object.entries(EVENT_TYPE_DOT).map(([type, cls]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${cls}`} />
              <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-white/30">{type}</span>
            </div>
          ))}
          <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-white/40">{monthCount} event{monthCount === 1 ? "" : "s"} this month</span>
        </div>
        {hasFilter && (
          <span className="font-mono text-[9px] text-coder-purple/60 uppercase tracking-[0.08em]">
            {partnerMode === "partner" ? (partnerIdFilter ? `Partner: ${partners.find(p => p.id === partnerIdFilter)?.name ?? "…"}` : "Partner events") : partnerMode === "coder" ? "Coder events" : partnerMode === "techAlliance" ? "Tech Alliance events" : "Community events"}
          </span>
        )}
      </div>

      {/* Dateless events: podcasts & date-TBD */}
      {datelessEvents.length > 0 && (
        <div className="mt-8">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/40 mb-2.5">
            No fixed date — podcasts &amp; date-TBD ({datelessEvents.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {datelessEvents.map((ev) => (
              <Link key={ev.id} href={`/events/${ev.id}`}
                className="flex items-center gap-2 bg-coder-panel border border-white/[0.08] rounded-lg px-3 py-2 hover:bg-coder-panel-alt hover:border-coder-purple/40 transition-colors">
                <span className={`w-2 h-2 rounded-full ${EVENT_TYPE_DOT[ev.type] ?? "bg-white/30"}`} />
                <span className="text-xs text-white/80">{ev.title}</span>
                {ev.partner && <span className="font-mono text-[9px] text-coder-cyan/70">{ev.partner.name}</span>}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
