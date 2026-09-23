"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  EVENT_TYPE_STYLES, STATUS_STYLES, LIKELIHOOD_STYLES,
  ACTION_STYLES, ACTION_LABELS, scoreColor,
  EVENT_TYPES, REGIONS, COST_BUCKETS, costBucket,
  VISIBLE_CATEGORIES, CATEGORY_LABELS, CATEGORY_TAGLINES, CATEGORY_RANK_HINTS,
  CATEGORY_STYLES, CATEGORY_ACCENT,
} from "@/lib/constants";
import { deriveCategory, categoryRankReason, sortByCategoryRank } from "@/lib/events";
import EventAvatar, { TypeIcon, TYPE_COLORS } from "@/components/EventAvatar";
import AudienceBadges from "@/components/AudienceBadges";
import ApplyModal from "@/components/ApplyModal";
import MultiSelect from "@/components/MultiSelect";
import { useAvailability, AvailabilityChip } from "@/components/Availability";

interface PartnerBasic { id: string; name: string; }

interface Event {
  id: string;
  title: string;
  type: string;
  status: string;
  category: string | null;
  audienceSignals: string | null;
  startDate: string | null;
  endDate: string | null;
  cfpDeadline: string | null;
  location: string | null;
  isOnline: boolean;
  region: string | null;
  city: string | null;
  description: string | null;
  url: string | null;
  partnerId: string | null;
  partner: { id: string; name: string; category: string | null } | null;
  isPaid: boolean | null;
  paidNote: string | null;
  ticketCost: string | null;
  audienceDescription: string | null;
  audienceSize: number | null;
  otherSpeakers: string | null;
  acceptanceLikelihood: string | null;
  howToApply: string | null;
  pitchDraft: string | null;
  industry: string | null;
  relevancyScore: number | null;
  relevancyRationale: string | null;
  suggestedAction: string | null;
  attending: boolean;
  readiness: string | null;
  applyUrl: string | null;
}

function getSortKey(ev: Event): number | null {
  const dates = [ev.cfpDeadline, ev.startDate]
    .filter((d): d is string => !!d)
    .map((d) => new Date(d).getTime());
  return dates.length > 0 ? Math.min(...dates) : null;
}

function sortEvents(evs: Event[]): Event[] {
  const now = Date.now();
  return [...evs].sort((a, b) => {
    const ka = getSortKey(a);
    const kb = getSortKey(b);
    const gA = ka === null ? 1 : ka >= now ? 0 : 2;
    const gB = kb === null ? 1 : kb >= now ? 0 : 2;
    if (gA !== gB) return gA - gB;
    // Primary ranking: by date (soonest first). Relevancy is only a tie-breaker.
    if (ka !== null && kb !== null && ka !== kb) return ka - kb;
    const rA = a.relevancyScore ?? -1;
    const rB = b.relevancyScore ?? -1;
    return rB - rA;
  });
}

const selCls = "px-3 py-1.5 bg-coder-control border border-white/10 rounded-lg text-sm text-white/80 focus:outline-none focus:border-coder-purple focus:ring-1 focus:ring-coder-purple transition-colors";

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;
}
function truncate(s: string | null, max = 60) {
  if (!s) return null;
  return s.length > max ? s.slice(0, max) + "…" : s;
}


/**
 * Browse and search the whole catalogue: track tabs, filters, and the ranked
 * event list.
 *
 * Lifted out of the Overview page, where it sat underneath the next-7-days
 * strip. Searching 1300 events is its own task, not a footnote to a dashboard,
 * and burying the filter bar below a list of upcoming events meant scrolling
 * past today's agenda to reach it.
 *
 * It owns its own fetch rather than taking events as a prop: the two pages want
 * different slices — the dashboard needs counts and the week ahead, this needs
 * everything — and threading one list through a parent would make each page
 * wait on data the other needed.
 */
export default function EventBrowser() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [partners,  setPartners]  = useState<PartnerBasic[]>([]);
  const [loading,   setLoading]   = useState(true);

  const [typeFilter,      setTypeFilter]      = useState<string[]>([]);
  /* Seeded from ?status= so the Overview's stat cards can hand a status over
     when they link here — they used to filter a list on their own page. */
  const [statusFilter,    setStatusFilter]    = useState<string[]>(
    () => { const s = searchParams.get("status"); return s ? [s] : []; },
  );
  const [regionFilter,    setRegionFilter]    = useState<string[]>([]);
  const [cityFilter,      setCityFilter]      = useState<string[]>([]);
  const [costFilter,      setCostFilter]      = useState<string[]>([]);
  const [searchFilter,    setSearchFilter]    = useState("");
  const [partnerMode,     setPartnerMode]     = useState("");
  const [partnerIdFilter, setPartnerIdFilter] = useState("");
  const [actionFilter,    setActionFilter]    = useState<string[]>([]);
  const [categoryTab,     setCategoryTab]     = useState("");
  const [applyEvent,      setApplyEvent]      = useState<Event | null>(null);

  /* isAdmin: determined by whether /api/users returns 200 */
  const [isAdmin, setIsAdmin] = useState(false);


  useEffect(() => {
    Promise.all([
      fetch("/api/events").then((r) => r.json()),
      fetch("/api/partners").then((r) => r.json()),
    ])
      .then(([evs, pts]: [Event[], PartnerBasic[]]) => {
        setAllEvents(Array.isArray(evs) ? evs : []);
        setPartners(Array.isArray(pts) ? pts : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    fetch("/api/auth/me").then((r) => r.json()).then((d: { role?: string }) => setIsAdmin(d?.role === "ADMIN")).catch(() => setIsAdmin(false));
  }, []);


  const handlePartnerMode = (val: string) => {
    setPartnerMode(val);
    if (val !== "partner") setPartnerIdFilter("");
  };

  /* Toggle attending flag with optimistic local update */
  const toggleAttending = async (e: React.MouseEvent, evId: string, current: boolean) => {
    e.stopPropagation();
    setAllEvents((prev) =>
      prev.map((ev) => ev.id === evId ? { ...ev, attending: !current } : ev)
    );
    await fetch(`/api/events/${evId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attending: !current }),
    });
  };


  const filtered = allEvents.filter((ev) => {
      const inSel = (arr: string[], val: string | null | undefined) => arr.length === 0 || (val != null && arr.includes(val));
      if (!inSel(typeFilter, ev.type)) return false;
      if (!inSel(statusFilter, ev.status)) return false;
      if (!inSel(regionFilter, ev.region)) return false;
      if (!inSel(cityFilter, ev.city)) return false;
      if (!inSel(actionFilter, ev.suggestedAction)) return false;
      if (costFilter.length && !costFilter.includes(costBucket(ev))) return false;
      if (searchFilter) {
        const q = searchFilter.toLowerCase();
        if (!ev.title.toLowerCase().includes(q) &&
            !ev.description?.toLowerCase().includes(q) &&
            !ev.location?.toLowerCase().includes(q)) return false;
      }
      if (partnerMode === "partner") {
        if (!ev.partner) return false;
        if (partnerIdFilter && ev.partnerId !== partnerIdFilter) return false;
      }
      if (partnerMode === "community" && ev.partner) return false;
      if (partnerMode === "techAlliance" && ev.partner?.category !== "Tech Alliance") return false;
      return true;
    });

  /* Counts per track (over the filtered set, before the track filter itself). */
  const categoryCounts: Record<string, number> = { ATTEND: 0, PARTICIPATE: 0, SPEAK: 0 };
  for (const ev of filtered) categoryCounts[deriveCategory(ev)]++;

  /* When a track is selected, filter to it and rank within-track; otherwise the
     original mixed-list sort (soonest deadline, then relevance). */
  const displayed = categoryTab
    ? sortByCategoryRank(filtered.filter((ev) => deriveCategory(ev) === categoryTab))
    : sortEvents(filtered);

  const hasFilters = typeFilter.length || statusFilter.length || regionFilter.length || cityFilter.length || costFilter.length || searchFilter || partnerMode || partnerIdFilter || actionFilter.length;
  const clearFilters = () => {
    setTypeFilter([]); setStatusFilter([]); setRegionFilter([]); setCityFilter([]); setCostFilter([]);
    setSearchFilter(""); setPartnerMode(""); setPartnerIdFilter(""); setActionFilter([]);
  };

  /* Work-calendar free/busy for the events on screen (admin only). */
  const { availability, calendarConfigured } = useAvailability(displayed, isAdmin);


  return (
    <>
      {/* Track selector: Attend · Participate · Speak */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCategoryTab("")}
            className={`px-3.5 py-2 rounded-lg border text-left transition-colors ${
              categoryTab === ""
                ? "bg-white/[0.06] border-white/25 text-white"
                : "bg-coder-panel border-white/[0.07] text-white/45 hover:text-white/80 hover:border-white/15"
            }`}
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.08em]">All tracks</span>
            <span className="ml-2 font-mono text-[10px] text-white/30">{filtered.length}</span>
          </button>
          {VISIBLE_CATEGORIES.map((cat) => {
            const active = categoryTab === cat;
            const accent = CATEGORY_ACCENT[cat];
            return (
              <button
                key={cat}
                onClick={() => setCategoryTab(active ? "" : cat)}
                className={`px-3.5 py-2 rounded-lg border text-left transition-colors ${
                  active ? "bg-coder-panel" : "bg-coder-panel hover:border-white/15"
                }`}
                style={{
                  borderColor: active ? accent : "rgba(255,255,255,0.07)",
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="font-mono text-[11px] uppercase tracking-[0.08em]"
                    style={{ color: active ? accent : "rgba(255,255,255,0.55)" }}
                  >
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <span className="font-mono text-[10px] text-white/30">{categoryCounts[cat]}</span>
                </div>
                <p className="font-mono text-[9px] text-white/25 mt-0.5 leading-tight">{CATEGORY_TAGLINES[cat]}</p>
              </button>
            );
          })}
        </div>
        {categoryTab && (
          <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/30 mt-2">
            {CATEGORY_RANK_HINTS[categoryTab]}
            {isAdmin && !calendarConfigured && (
              <span className="ml-2 text-white/20 normal-case tracking-normal">
                · add your calendar in Settings to see availability
              </span>
            )}
          </p>
        )}
      </div>


      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-5">
        <input type="text" placeholder="Search events…" value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)}
          className="flex-1 min-w-40 px-3 py-1.5 bg-coder-control border border-white/10 rounded-lg text-sm text-white/80 placeholder-white/25 focus:outline-none focus:border-coder-purple focus:ring-1 focus:ring-coder-purple transition-colors" />
        <MultiSelect label="All types" options={EVENT_TYPES} selected={typeFilter} onChange={setTypeFilter} />
        <MultiSelect label="All regions" options={REGIONS} selected={regionFilter} onChange={setRegionFilter} />
        <MultiSelect label="All cities" options={[...new Set(allEvents.map((e) => e.city).filter((c): c is string => !!c))].sort()} selected={cityFilter} onChange={setCityFilter} />
        <MultiSelect label="Cost" options={COST_BUCKETS} selected={costFilter} onChange={setCostFilter} />
        <select value={partnerMode} onChange={(e) => handlePartnerMode(e.target.value)} className={selCls}>
          <option value="">All events</option>
          <option value="partner">Partner events</option>
          <option value="community">Community events</option>
          <option value="techAlliance">Tech Alliance events</option>
        </select>
        {partnerMode === "partner" && (
          <select value={partnerIdFilter} onChange={(e) => setPartnerIdFilter(e.target.value)} className={selCls}>
            <option value="">All partners</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <MultiSelect label="All actions" options={["APPLY_TO_SPEAK", "BOTH", "ATTEND"]} selected={actionFilter} onChange={setActionFilter} labels={{ APPLY_TO_SPEAK: "Apply to speak", BOTH: "Attend + Apply", ATTEND: "Attend only" }} />
        {hasFilters && (
          <button onClick={clearFilters} className="px-3 py-1.5 text-xs text-white/40 hover:text-white border border-white/10 hover:border-white/20 rounded-lg transition-colors">Clear</button>
        )}
        <Link href="/events/new" className="ml-auto px-4 py-1.5 bg-coder-purple hover:bg-coder-purple-hover text-black text-sm font-semibold rounded-lg transition-colors">
          + New Event
        </Link>
      </div>


      {/* Count */}
      {!loading && (
        <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-white/20 mb-3">
          {displayed.length} event{displayed.length !== 1 ? "s" : ""}{hasFilters ? " (filtered)" : ""}
        </p>
      )}


      {/* Event list */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-white/30 font-mono text-sm">Loading…</div>
      ) : displayed.length === 0 ? (
        /* ── Empty state with type illustration ── */
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div
            className="flex items-center justify-center w-24 h-24 rounded-2xl mb-5"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <TypeIcon type="EVENT" color="rgba(255,255,255,0.15)" size={44} />
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/20">
            {hasFilters ? "No events match your filters" : "No events yet"}
          </p>
          {hasFilters && (
            <button onClick={clearFilters} className="mt-3 font-mono text-[9px] text-coder-purple/60 hover:text-coder-purple uppercase tracking-widest transition-colors">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map((ev) => {
            const lh       = ev.acceptanceLikelihood;
            const hasPitch = !!ev.pitchDraft;
            const isPast   = getSortKey(ev) !== null && getSortKey(ev)! < Date.now();

            return (
              <div
                key={ev.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/events/${ev.id}`)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") router.push(`/events/${ev.id}`); }}
                className={`group bg-coder-panel hover:bg-coder-panel-alt border border-white/[0.07] hover:border-coder-purple/20 rounded-xl px-4 py-3.5 transition-all duration-150 cursor-pointer ${isPast ? "opacity-60" : ""}`}
              >
                <div className="flex items-start gap-3">

                  {/* Avatar */}
                  <EventAvatar event={ev} size={40} />

                  {/* Body */}
                  <div className="flex-1 min-w-0">

                    {/* Line 1: type chip + title */}
                    <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                      <span className={`font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded flex-shrink-0 ${EVENT_TYPE_STYLES[ev.type]}`}>
                        {ev.type}
                      </span>
                      <h3 className="font-medium text-white/90 group-hover:text-white transition-colors text-sm leading-snug">
                        {ev.title}
                      </h3>
                    </div>

                    {/* Line 2: secondary chips */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      <span className={`font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded ${CATEGORY_STYLES[deriveCategory(ev)]}`}>
                        {CATEGORY_LABELS[deriveCategory(ev)]}
                      </span>
                      {ev.suggestedAction && ACTION_STYLES[ev.suggestedAction] && (
                        <span className={`font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded ${ACTION_STYLES[ev.suggestedAction]}`}>
                          {ACTION_LABELS[ev.suggestedAction] ?? ev.suggestedAction}
                        </span>
                      )}
                      {ev.industry && (
                        <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-coder-purple/10 text-coder-purple/60 border border-coder-purple/20">{ev.industry}</span>
                      )}
                      {lh && LIKELIHOOD_STYLES[lh] && (
                        <span className={`font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded ${LIKELIHOOD_STYLES[lh]}`}>{lh}</span>
                      )}
                      {ev.partner?.category === "Tech Alliance" && (
                        <span className="font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-coder-amber/15 text-coder-amber border border-coder-amber/30">Tech Alliance</span>
                      )}
                      {hasPitch && (
                        <span role="link"
                          onClick={(e) => { e.stopPropagation(); router.push(`/events/${ev.id}#pitch`); }}
                          className="font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-coder-purple/10 text-coder-purple/70 border border-coder-purple/20 hover:bg-coder-purple/20 cursor-pointer transition-colors"
                          title="Suggested application ready">
                          ✓ Application ready
                        </span>
                      )}
                      {ev.city && <span className="font-mono text-[9px] text-white/45">{ev.city}</span>}
                      {ev.region && <span className="font-mono text-[9px] text-white/30">{ev.region}</span>}
                      {/* Status at the end */}
                      <span className={`font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded ${STATUS_STYLES[ev.status]}`}>{ev.status}</span>
                      {isAdmin && <AvailabilityChip result={availability[ev.id]} compact />}

                      {/* Mark as attending — shown on ATTEND/BOTH events for admins */}
                      {isAdmin && (ev.suggestedAction === "ATTEND" || ev.suggestedAction === "BOTH") && (
                        <button
                          onClick={(e) => toggleAttending(e, ev.id, ev.attending)}
                          className={`font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded border transition-colors ${
                            ev.attending
                              ? "bg-coder-cyan/15 text-coder-cyan border-coder-cyan/30 hover:bg-coder-cyan/25"
                              : "bg-white/5 text-white/30 border-white/10 hover:text-white/60 hover:border-white/20"
                          }`}
                          title={ev.attending ? "Remove from attending" : "Mark as attending"}
                        >
                          {ev.attending ? "✓ Attending" : "+ Attending"}
                        </button>
                      )}
                    </div>

                    {/* Line 3: muted intel row */}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[9px] text-white/30">
                      {ev.location && <span>📍 {ev.location}</span>}
                      {ev.isOnline && !ev.location && <span>🌐 Online</span>}
                      {ev.partner && <span>🤝 {ev.partner.name}</span>}
                      {ev.ticketCost && (
                        <span className={/free/i.test(ev.ticketCost) ? "text-coder-green/70" : "text-coder-amber/80"}>🎟 {truncate(ev.ticketCost, 22)}</span>
                      )}
                      {ev.isPaid === true && (
                        <span className="text-coder-green/70">{ev.paidNote ? truncate(ev.paidNote, 22) : "Paid"}</span>
                      )}
                      {ev.isPaid === false && (
                        <span className="text-white/25">{ev.paidNote ? truncate(ev.paidNote, 22) : "Unpaid"}</span>
                      )}
                      {ev.audienceSize != null && (
                        <span>👥 {ev.audienceSize.toLocaleString()}{ev.audienceDescription ? ` · ${truncate(ev.audienceDescription, 30)}` : ""}</span>
                      )}
                      {!ev.audienceSize && ev.audienceDescription && (
                        <span>👥 {truncate(ev.audienceDescription, 40)}</span>
                      )}
                      {ev.otherSpeakers && <span>🎤 {truncate(ev.otherSpeakers, 40)}</span>}
                      {(ev.applyUrl || ev.howToApply) && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isAdmin) { setApplyEvent(ev); return; }
                            const link = ev.applyUrl || (ev.howToApply?.startsWith("http") ? ev.howToApply : null);
                            if (link) window.open(link, "_blank", "noopener"); else router.push(`/events/${ev.id}`);
                          }}
                          className="text-coder-purple/70 hover:text-coder-purple transition-colors cursor-pointer underline underline-offset-2"
                        >
                          → {isAdmin ? "Apply (autofill) ↗" : (ev.applyUrl ? "Apply ↗" : truncate(ev.howToApply, 35))}
                        </span>
                      )}
                    </div>

                    {/* Audience signals */}
                    <AudienceBadges signals={ev.audienceSignals} className="mt-1.5" max={6} />
                  </div>

                  {/* Right column: score badge + dates */}
                  <div className="flex-shrink-0 flex flex-col items-end gap-1 min-w-[76px]">
                    {ev.relevancyScore != null && (
                      <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${scoreColor(ev.relevancyScore)}`} title={ev.relevancyRationale ?? ""}>
                        {ev.relevancyScore}/100
                      </span>
                    )}
                    <div className="font-mono text-[9px] text-white/25 text-right space-y-0.5">
                      {ev.cfpDeadline && <div><span className="text-coder-coral/70">CFP</span> {fmt(ev.cfpDeadline)}</div>}
                      {ev.startDate   && <div>{fmt(ev.startDate)}</div>}
                    </div>
                    {categoryTab && (
                      <p className="font-mono text-[8.5px] text-white/30 text-right max-w-[130px] leading-tight mt-0.5">
                        {categoryRankReason(ev)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {applyEvent && (
        <ApplyModal event={applyEvent} onClose={() => setApplyEvent(null)} />
      )}
    </>
  );
}
