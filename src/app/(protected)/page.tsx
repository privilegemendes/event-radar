"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ACTION_STYLES, ACTION_LABELS } from "@/lib/constants";
import EventAvatar from "@/components/EventAvatar";

interface Event {
  id: string;
  title: string;
  status: string;
  type: string;
  startDate: string | null;
  location: string | null;
  isOnline: boolean;
  url: string | null;
  howToApply: string | null;
  suggestedAction: string | null;
  partner: { id: string; name: string; category: string | null } | null;
}

const STAT_BORDER: Record<string, string> = {
  DISCOVERED: "border-white/15", APPROVED: "border-coder-cyan/50",
  PITCHED: "border-coder-purple/50", ACCEPTED: "border-coder-green/50",
  SPOKEN: "border-coder-green/30", REJECTED: "border-coder-coral/50",
};
const STAT_NUM: Record<string, string> = {
  DISCOVERED: "text-white/70", APPROVED: "text-coder-cyan",
  PITCHED: "text-coder-purple", ACCEPTED: "text-coder-green",
  SPOKEN: "text-coder-green/70", REJECTED: "text-coder-coral",
};

/**
 * The dashboard: pipeline figures and the week ahead.
 *
 * Browsing and searching the catalogue moved to /events — see EventBrowser.
 * What is left answers "where do things stand and what is imminent", which is
 * a different question from "find me an event", and wants a different page.
 */
export default function OverviewPage() {
  const router = useRouter();
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((evs: Event[]) => setAllEvents(Array.isArray(evs) ? evs : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const now = new Date();
  const todayStart = new Date(now.toDateString());
  const byStatus: Record<string, number> = {};
  let upcoming = 0;
  for (const ev of allEvents) {
    byStatus[ev.status] = (byStatus[ev.status] ?? 0) + 1;
    if (ev.status !== "REJECTED" && ev.startDate && new Date(ev.startDate) >= todayStart) upcoming++;
  }

  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const comingUp = allEvents
    .filter((ev) => ev.status !== "REJECTED" && ev.startDate &&
      new Date(ev.startDate) >= new Date(now.toDateString()) &&
      new Date(ev.startDate) <= weekAhead)
    .sort((a, b) => new Date(a.startDate!).getTime() - new Date(b.startDate!).getTime());
  /* Capped: a full week of a 1300-event catalogue ran to 56 rows, which made
     the dashboard one long scroll rather than a summary. The rest live on the
     Calendar, which is organised by date and is where "what else is on this
     week" actually belongs. */
  const COMING_UP_LIMIT = 10;
  const comingUpShown = comingUp.slice(0, COMING_UP_LIMIT);
  const comingUpHidden = comingUp.length - comingUpShown.length;

  const registerLink = (ev: Event) =>
    ev.url || (ev.howToApply && /^https?:\/\//.test(ev.howToApply.trim()) ? ev.howToApply.trim() : null);

  return (
    <div className="max-w-7xl mx-auto">

      {/* Header */}
      <div className="relative mb-7">
        <div aria-hidden className="pointer-events-none absolute -inset-8 rounded-2xl"
          style={{ background: "radial-gradient(ellipse 600px 200px at 30% 50%, rgba(188,124,255,0.06) 0%, transparent 70%)" }} />
        <h1 className="text-xl font-semibold text-white">Overview</h1>
      </div>


      {/* Dashboard figures — Discovered · Approved · Upcoming */}
      <div className="grid grid-cols-3 gap-2.5 mb-7">
        {[
          { key: "DISCOVERED", label: "Discovered", value: byStatus["DISCOVERED"] ?? 0, num: STAT_NUM["DISCOVERED"], border: STAT_BORDER["DISCOVERED"], status: "DISCOVERED" as string | null },
          { key: "APPROVED",   label: "Approved",   value: byStatus["APPROVED"] ?? 0,   num: STAT_NUM["APPROVED"],   border: STAT_BORDER["APPROVED"],   status: "APPROVED" as string | null },
          { key: "UPCOMING",   label: "Upcoming",   value: upcoming,                    num: "text-coder-green",     border: "border-white/[0.08]",     status: null },
        ].map((c) => {
          /* These used to toggle a status filter on a list directly below them.
             That list is on /events now, so they carry the status across in the
             URL instead of going dead. */
          const card = (
            <>
              <p className={`text-3xl font-bold font-mono ${c.num}`}>{c.value}</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/30 mt-1">{c.label}</p>
            </>
          );
          const cls = `bg-coder-panel border ${c.border} rounded-xl p-4 text-left block transition-colors`;
          return c.status ? (
            <Link key={c.key} href={`/events?status=${c.status}`} className={`${cls} hover:bg-coder-panel-alt`}>
              {card}
            </Link>
          ) : (
            <div key={c.key} className={cls}>{card}</div>
          );
        })}
      </div>


      {/* Coming up: next 7 days */}
      {comingUp.length > 0 && (
        <div className="mb-7">
          <div className="flex items-baseline gap-2 mb-2.5">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-coder-green">Coming up — next 7 days</h2>
            <span className="font-mono text-[10px] text-white/30">{comingUp.length}</span>
          </div>
          <div className="space-y-1.5">
            {comingUpShown.map((ev) => {
              const link = registerLink(ev);
              return (
                <div key={ev.id}
                  className="flex flex-wrap items-center gap-3 bg-coder-panel border border-coder-green/20 rounded-xl px-4 py-2.5 hover:bg-coder-panel-alt transition-colors">
                  {/* Small avatar */}
                  <EventAvatar event={ev} size={32} />
                  <div className="font-mono text-[10px] text-coder-green w-20 flex-shrink-0">
                    {new Date(ev.startDate!).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                  </div>
                  <button onClick={() => router.push(`/events/${ev.id}`)}
                    className="text-left text-sm text-white hover:text-coder-purple transition-colors font-medium min-w-0 flex-1 truncate cursor-pointer">
                    {ev.title}
                  </button>
                  {ev.partner && (
                    <span className="font-mono text-[9px] uppercase tracking-[0.08em] px-2 py-0.5 rounded-full bg-coder-cyan/10 text-coder-cyan flex-shrink-0">{ev.partner.name}</span>
                  )}
                  {ev.suggestedAction && (
                    <span className={`font-mono text-[9px] uppercase tracking-[0.08em] px-2 py-0.5 rounded-full flex-shrink-0 ${ACTION_STYLES[ev.suggestedAction] ?? "bg-white/5 text-white/40"}`}>
                      {ACTION_LABELS[ev.suggestedAction] ?? ev.suggestedAction}
                    </span>
                  )}
                  <span className="font-mono text-[10px] text-white/35 flex-shrink-0">{ev.isOnline ? "Online" : ev.location ?? ""}</span>
                  {link ? (
                    <a href={link} target="_blank" rel="noopener noreferrer"
                      className="flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] px-3 py-1.5 rounded-lg bg-coder-green text-black font-semibold hover:bg-coder-green-hover transition-colors">
                      {ev.type === "WEBINAR" || ev.isOnline ? "Join / Register ↗" : "Get ticket ↗"}
                    </a>
                  ) : (
                    <span className="flex-shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-white/25">No link — open event</span>
                  )}
                </div>
              );
            })}
          </div>

          {comingUpHidden > 0 && (
            <Link href="/calendar"
              className="mt-2 flex items-center justify-center gap-2 py-2 rounded-xl border border-white/[0.07] hover:border-coder-green/30 hover:bg-coder-panel-alt transition-colors font-mono text-[10px] uppercase tracking-[0.08em] text-white/35 hover:text-coder-green">
              {comingUpHidden} more this week — open calendar →
            </Link>
          )}
        </div>
      )}


      {/* Everything else lives on the browse page now. */}
      <div className="mt-8 flex items-center justify-between gap-3 bg-coder-panel border border-white/[0.07] rounded-xl px-5 py-4">
        <div>
          <p className="text-sm text-white/80 font-medium">Browse the catalogue</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-white/30 mt-1">
            {loading ? "Loading…" : `Search and filter ${allEvents.length} events`}
          </p>
        </div>
        <Link href="/events"
          className="flex-shrink-0 px-4 py-2 bg-coder-purple hover:bg-coder-purple-hover text-black text-sm font-semibold rounded-lg transition-colors">
          Search events →
        </Link>
      </div>
    </div>
  );
}
