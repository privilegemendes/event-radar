"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ReadinessCard, { type CustomTask } from "@/components/ReadinessCard";
import { SPEAKING_CHECKLIST, ATTENDING_CHECKLIST, GIG_STAGES, ATTEND_STAGES } from "@/lib/constants";
import { TypeIcon } from "@/components/EventAvatar";
import { BRAND } from "@/lib/brand";

interface PodiumEvent {
  id: string;
  title: string;
  type: string;
  url: string | null;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  isOnline: boolean;
  status: string;
  attending: boolean;
  readiness: string | null;
  prepStage: string | null;
  customTasks: string | null;
}

function isFutureOrDateless(ev: PodiumEvent, nowTs: number): boolean {
  return ev.startDate == null || new Date(ev.startDate).getTime() >= nowTs;
}

function sortByDate(evs: PodiumEvent[]): PodiumEvent[] {
  return [...evs].sort((a, b) => {
    if (!a.startDate && !b.startDate) return 0;
    if (!a.startDate) return 1;
    if (!b.startDate) return -1;
    return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
  });
}

export default function PodiumsPage() {
  const router = useRouter();
  const [events,  setEvents]  = useState<PodiumEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    /* No role probe any more: the readiness checklist is the viewer's own
       EventOpportunity, so every signed-in speaker may edit it. The page is
       already owner-gated server-side in its layout. */
    fetch("/api/events?view=podium")
      .then((r) => r.json())
      .then((evs) => setEvents(Array.isArray(evs) ? evs as PodiumEvent[] : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  /* Local optimistic update helpers */
  const updateEvent = (id: string, patch: Partial<PodiumEvent>) =>
    setEvents((prev) => prev.map((ev) => ev.id === id ? { ...ev, ...patch } : ev));

  const nowTs = Date.now();

  const upcomingSpeaking = sortByDate(
    events.filter((ev) => ["ACCEPTED", "SPOKEN"].includes(ev.status) && isFutureOrDateless(ev, nowTs))
  );
  const upcomingAttending = sortByDate(
    events.filter((ev) =>
      ev.attending &&
      !["ACCEPTED", "SPOKEN"].includes(ev.status) &&
      isFutureOrDateless(ev, nowTs)
    )
  );

  const isEmpty = upcomingSpeaking.length === 0 && upcomingAttending.length === 0;

  return (
    <div className="max-w-5xl mx-auto">

      {/* Header */}
      <div className="relative mb-7">
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-8 rounded-2xl"
          style={{ background: "radial-gradient(ellipse 500px 180px at 40% 50%, rgba(188,124,255,0.07) 0%, transparent 70%)" }}
        />
        <h1 className="text-xl font-semibold text-white">Podium</h1>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/30 mt-1">
          Speaking commitments &amp; events you&apos;re attending
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-white/30 font-mono text-sm">Loading…</div>
      ) : isEmpty ? (
        /* ── Empty state ── */
        <div className="flex flex-col items-center justify-center py-20 text-center gap-8">
          <div>
            <div
              className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4"
              style={{ background: "rgba(188,124,255,0.06)", border: "1px solid rgba(188,124,255,0.12)" }}
            >
              <TypeIcon type="PODCAST" color="rgba(188,124,255,0.3)" size={36} />
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/25 mb-1">
              No confirmed speaking gigs yet
            </p>
            <p className="font-mono text-[9px] text-white/20 max-w-xs mx-auto leading-relaxed">
              Approve and pitch events from the Overview, then move them to ACCEPTED to track your prep here.
            </p>
            <button
              onClick={() => router.push("/")}
              className="mt-4 font-mono text-[9px] text-coder-purple/60 hover:text-coder-purple uppercase tracking-widest transition-colors"
            >
              Go to Overview →
            </button>
          </div>
          <div>
            <div
              className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4"
              style={{ background: "rgba(1,242,255,0.04)", border: "1px solid rgba(1,242,255,0.10)" }}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(1,242,255,0.3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/25 mb-1">
              Not attending any events yet
            </p>
            <p className="font-mono text-[9px] text-white/20 max-w-xs mx-auto leading-relaxed">
              Use the &ldquo;+ Attending&rdquo; button on ATTEND-suggested events to track events you plan to go to.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-10">

          {/* ── Speaking gigs ── */}
          {upcomingSpeaking.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={BRAND.purple} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="10" r="4"/>
                  <path d="M12 14v4M8 20h8M6 6.5C4.8 8 4 9.9 4 12M18 6.5c1.2 1.5 2 3.4 2 5.5"/>
                </svg>
                <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-coder-purple">
                  Upcoming speaking gigs
                </h2>
                <span className="font-mono text-[10px] text-white/30">{upcomingSpeaking.length}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {upcomingSpeaking.map((ev) => (
                  <ReadinessCard
                    key={ev.id}
                    event={ev}
                    checklist={SPEAKING_CHECKLIST}
                    stages={GIG_STAGES}
                    accent={BRAND.purple}
                    canEdit
                    onReadinessChange={(id, next) => updateEvent(id, { readiness: JSON.stringify(next) })}
                    onPrepStageChange={(id, stage) => updateEvent(id, { prepStage: stage })}
                    onCustomTasksChange={(id, tasks) => updateEvent(id, { customTasks: JSON.stringify(tasks) })}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── Attending events ── */}
          {upcomingAttending.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={BRAND.cyan} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-coder-cyan">
                  Upcoming attending events
                </h2>
                <span className="font-mono text-[10px] text-white/30">{upcomingAttending.length}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {upcomingAttending.map((ev) => (
                  <ReadinessCard
                    key={ev.id}
                    event={ev}
                    checklist={ATTENDING_CHECKLIST}
                    stages={ATTEND_STAGES}
                    accent={BRAND.cyan}
                    canEdit
                    onReadinessChange={(id, next) => updateEvent(id, { readiness: JSON.stringify(next) })}
                    onPrepStageChange={(id, stage) => updateEvent(id, { prepStage: stage })}
                    onCustomTasksChange={(id, tasks) => updateEvent(id, { customTasks: JSON.stringify(tasks) })}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
