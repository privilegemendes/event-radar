"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  EVENT_TYPE_STYLES, STATUS_STYLES, LIKELIHOOD_STYLES,
  ACTION_STYLES, ACTION_LABELS, scoreColor,
  EVENT_TYPES, REGIONS, COST_BUCKETS, costBucket,
  CATEGORIES, CATEGORY_LABELS, CATEGORY_TAGLINES, CATEGORY_RANK_HINTS,
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
  coderRelevant: boolean;
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
  isCoderEvent: boolean;
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

const STAT_BORDER: Record<string, string> = {
  DISCOVERED: "border-white/15", APPROVED: "border-[#01F2FF]/50",
  PITCHED: "border-[#BC7CFF]/50", ACCEPTED: "border-[#66FFAB]/50",
  SPOKEN: "border-[#66FFAB]/30", REJECTED: "border-[#FF8067]/50",
};
const STAT_NUM: Record<string, string> = {
  DISCOVERED: "text-white/70", APPROVED: "text-[#01F2FF]",
  PITCHED: "text-[#BC7CFF]", ACCEPTED: "text-[#66FFAB]",
  SPOKEN: "text-[#66FFAB]/70", REJECTED: "text-[#FF8067]",
};

const selCls = "px-3 py-1.5 bg-[#0D1011] border border-white/10 rounded-lg text-sm text-white/80 focus:outline-none focus:border-[#BC7CFF] focus:ring-1 focus:ring-[#BC7CFF] transition-colors";

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;
}
function truncate(s: string | null, max = 60) {
  if (!s) return null;
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export default function OverviewPage() {
  const router = useRouter();
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [partners,  setPartners]  = useState<PartnerBasic[]>([]);
  const [loading,   setLoading]   = useState(true);

  const [typeFilter,      setTypeFilter]      = useState<string[]>([]);
  const [statusFilter,    setStatusFilter]    = useState<string[]>([]);
  const [coderFilter,     setCoderFilter]     = useState<string[]>([]);
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
    fetch("/api/users").then((r) => { if (r.ok) setIsAdmin(true); }).catch(() => {});
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
  const registerLink = (ev: Event) =>
    ev.url || (ev.howToApply && /^https?:\/\//.test(ev.howToApply.trim()) ? ev.howToApply.trim() : null);

  const filtered = allEvents.filter((ev) => {
      const inSel = (arr: string[], val: string | null | undefined) => arr.length === 0 || (val != null && arr.includes(val));
      if (!inSel(typeFilter, ev.type)) return false;
      if (!inSel(statusFilter, ev.status)) return false;
      if (!inSel(regionFilter, ev.region)) return false;
      if (!inSel(cityFilter, ev.city)) return false;
      if (!inSel(actionFilter, ev.suggestedAction)) return false;
      if (costFilter.length && !costFilter.includes(costBucket(ev))) return false;
      if (coderFilter.length) {
        const wantRel = coderFilter.includes("Coder relevant");
        const wantNot = coderFilter.includes("Not relevant");
        if (wantRel && !wantNot && !ev.coderRelevant) return false;
        if (wantNot && !wantRel && ev.coderRelevant) return false;
      }
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
      if (partnerMode === "coder" && !ev.isCoderEvent) return false;
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

  const hasFilters = typeFilter.length || statusFilter.length || coderFilter.length || regionFilter.length || cityFilter.length || costFilter.length || searchFilter || partnerMode || partnerIdFilter || actionFilter.length;
  const clearFilters = () => {
    setTypeFilter([]); setStatusFilter([]); setCoderFilter([]); setRegionFilter([]); setCityFilter([]); setCostFilter([]);
    setSearchFilter(""); setPartnerMode(""); setPartnerIdFilter(""); setActionFilter([]);
  };

  /* Work-calendar free/busy for the events on screen (admin only). */
  const { availability, calendarConfigured } = useAvailability(displayed, isAdmin);

  return (
    <div className="max-w-7xl mx-auto">

      {/* Header */}
      <div className="relative mb-7">
        <div aria-hidden className="pointer-events-none absolute -inset-8 rounded-2xl"
          style={{ background: "radial-gradient(ellipse 600px 200px at 30% 50%, rgba(188,124,255,0.06) 0%, transparent 70%)" }} />
        <h1 className="text-xl font-semibold text-white">Overview</h1>
      </div>

      {/* Track selector: Attend · Participate · Speak */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCategoryTab("")}
            className={`px-3.5 py-2 rounded-lg border text-left transition-colors ${
              categoryTab === ""
                ? "bg-white/[0.06] border-white/25 text-white"
                : "bg-[#101314] border-white/[0.07] text-white/45 hover:text-white/80 hover:border-white/15"
            }`}
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.08em]">All tracks</span>
            <span className="ml-2 font-mono text-[10px] text-white/30">{filtered.length}</span>
          </button>
          {CATEGORIES.map((cat) => {
            const active = categoryTab === cat;
            const accent = CATEGORY_ACCENT[cat];
            return (
              <button
                key={cat}
                onClick={() => setCategoryTab(active ? "" : cat)}
                className={`px-3.5 py-2 rounded-lg border text-left transition-colors ${
                  active ? "bg-[#101314]" : "bg-[#101314] hover:border-white/15"
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

      {/* Dashboard figures — Discovered · Approved · Upcoming */}
      <div className="grid grid-cols-3 gap-2.5 mb-7">
        {[
          { key: "DISCOVERED", label: "Discovered", value: byStatus["DISCOVERED"] ?? 0, num: STAT_NUM["DISCOVERED"], border: STAT_BORDER["DISCOVERED"], filter: "DISCOVERED" as string | null },
          { key: "APPROVED",   label: "Approved",   value: byStatus["APPROVED"] ?? 0,   num: STAT_NUM["APPROVED"],   border: STAT_BORDER["APPROVED"],   filter: "APPROVED" as string | null },
          { key: "UPCOMING",   label: "Upcoming",   value: upcoming,                    num: "text-[#66FFAB]",       border: "border-white/[0.08]",     filter: null },
        ].map((c) => (
          <button key={c.key}
            onClick={() => { if (c.filter) setStatusFilter(statusFilter.includes(c.filter) ? statusFilter.filter((s) => s !== c.filter) : [c.filter]); }}
            className={`bg-[#101314] border ${c.border} rounded-xl p-4 text-left transition-colors ${c.filter ? "hover:bg-[#141718] cursor-pointer" : "cursor-default"} ${c.filter && statusFilter.includes(c.filter) ? "ring-1 ring-[#BC7CFF]" : ""}`}>
            <p className={`text-3xl font-bold font-mono ${c.num}`}>{c.value}</p>
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/30 mt-1">{c.label}</p>
          </button>
        ))}
      </div>

      {/* Coming up: next 7 days */}
      {comingUp.length > 0 && (
        <div className="mb-7">
          <div className="flex items-baseline gap-2 mb-2.5">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#66FFAB]">Coming up — next 7 days</h2>
            <span className="font-mono text-[10px] text-white/30">{comingUp.length}</span>
          </div>
          <div className="space-y-1.5">
            {comingUp.map((ev) => {
              const link = registerLink(ev);
              return (
                <div key={ev.id}
                  className="flex flex-wrap items-center gap-3 bg-[#101314] border border-[#66FFAB]/20 rounded-xl px-4 py-2.5 hover:bg-[#141718] transition-colors">
                  {/* Small avatar */}
                  <EventAvatar event={ev} size={32} />
                  <div className="font-mono text-[10px] text-[#66FFAB] w-20 flex-shrink-0">
                    {new Date(ev.startDate!).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                  </div>
                  <button onClick={() => router.push(`/events/${ev.id}`)}
                    className="text-left text-sm text-white hover:text-[#BC7CFF] transition-colors font-medium min-w-0 flex-1 truncate cursor-pointer">
                    {ev.title}
                  </button>
                  {ev.partner && (
                    <span className="font-mono text-[9px] uppercase tracking-[0.08em] px-2 py-0.5 rounded-full bg-[#01F2FF]/10 text-[#01F2FF] flex-shrink-0">{ev.partner.name}</span>
                  )}
                  {ev.suggestedAction && (
                    <span className={`font-mono text-[9px] uppercase tracking-[0.08em] px-2 py-0.5 rounded-full flex-shrink-0 ${ACTION_STYLES[ev.suggestedAction] ?? "bg-white/5 text-white/40"}`}>
                      {ACTION_LABELS[ev.suggestedAction] ?? ev.suggestedAction}
                    </span>
                  )}
                  <span className="font-mono text-[10px] text-white/35 flex-shrink-0">{ev.isOnline ? "Online" : ev.location ?? ""}</span>
                  {link ? (
                    <a href={link} target="_blank" rel="noopener noreferrer"
                      className="flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] px-3 py-1.5 rounded-lg bg-[#66FFAB] text-black font-semibold hover:bg-[#8affc0] transition-colors">
                      {ev.type === "WEBINAR" || ev.isOnline ? "Join / Register ↗" : "Get ticket ↗"}
                    </a>
                  ) : (
                    <span className="flex-shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-white/25">No link — open event</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-5">
        <input type="text" placeholder="Search events…" value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)}
          className="flex-1 min-w-40 px-3 py-1.5 bg-[#0D1011] border border-white/10 rounded-lg text-sm text-white/80 placeholder-white/25 focus:outline-none focus:border-[#BC7CFF] focus:ring-1 focus:ring-[#BC7CFF] transition-colors" />
        <MultiSelect label="All types" options={EVENT_TYPES} selected={typeFilter} onChange={setTypeFilter} />
        <MultiSelect label="All regions" options={REGIONS} selected={regionFilter} onChange={setRegionFilter} />
        <MultiSelect label="All cities" options={[...new Set(allEvents.map((e) => e.city).filter((c): c is string => !!c))].sort()} selected={cityFilter} onChange={setCityFilter} />
        <MultiSelect label="Cost" options={COST_BUCKETS} selected={costFilter} onChange={setCostFilter} />
        <MultiSelect label="Coder relevance" options={["Coder relevant", "Not relevant"]} selected={coderFilter} onChange={setCoderFilter} />
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
        <MultiSelect label="All actions" options={["APPLY_TO_SPEAK", "BOTH", "ATTEND"]} selected={actionFilter} onChange={setActionFilter} labels={{ APPLY_TO_SPEAK: "Apply to speak", BOTH: "Attend + Apply", ATTEND: "Attend only" }} />
        {hasFilters && (
          <button onClick={clearFilters} className="px-3 py-1.5 text-xs text-white/40 hover:text-white border border-white/10 hover:border-white/20 rounded-lg transition-colors">Clear</button>
        )}
        <Link href="/events/new" className="ml-auto px-4 py-1.5 bg-[#BC7CFF] hover:bg-[#CA96FF] text-black text-sm font-semibold rounded-lg transition-colors">
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
            <button onClick={clearFilters} className="mt-3 font-mono text-[9px] text-[#BC7CFF]/60 hover:text-[#BC7CFF] uppercase tracking-widest transition-colors">
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
                className={`group bg-[#101314] hover:bg-[#141718] border border-white/[0.07] hover:border-[#BC7CFF]/20 rounded-xl px-4 py-3.5 transition-all duration-150 cursor-pointer ${isPast ? "opacity-60" : ""}`}
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
                        <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[#BC7CFF]/10 text-[#BC7CFF]/60 border border-[#BC7CFF]/20">{ev.industry}</span>
                      )}
                      {lh && LIKELIHOOD_STYLES[lh] && (
                        <span className={`font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded ${LIKELIHOOD_STYLES[lh]}`}>{lh}</span>
                      )}
                      {ev.coderRelevant && (
                        <span className="font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-[#BC7CFF]/15 text-[#BC7CFF] border border-[#BC7CFF]/30">Coder</span>
                      )}
                      {ev.isCoderEvent && (
                        <span className="font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-[#BC7CFF]/20 text-[#BC7CFF] border border-[#BC7CFF]/40 font-semibold">CODER EVENT</span>
                      )}
                      {ev.partner?.category === "Tech Alliance" && (
                        <span className="font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-[#FFC46B]/15 text-[#FFC46B] border border-[#FFC46B]/30">Tech Alliance</span>
                      )}
                      {hasPitch && (
                        <span role="link"
                          onClick={(e) => { e.stopPropagation(); router.push(`/events/${ev.id}#pitch`); }}
                          className="font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-[#BC7CFF]/10 text-[#BC7CFF]/70 border border-[#BC7CFF]/20 hover:bg-[#BC7CFF]/20 cursor-pointer transition-colors"
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
                              ? "bg-[#01F2FF]/15 text-[#01F2FF] border-[#01F2FF]/30 hover:bg-[#01F2FF]/25"
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
                        <span className={/free/i.test(ev.ticketCost) ? "text-[#66FFAB]/70" : "text-[#FFC46B]/80"}>🎟 {truncate(ev.ticketCost, 22)}</span>
                      )}
                      {ev.isPaid === true && (
                        <span className="text-[#66FFAB]/70">{ev.paidNote ? truncate(ev.paidNote, 22) : "Paid"}</span>
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
                          className="text-[#BC7CFF]/70 hover:text-[#BC7CFF] transition-colors cursor-pointer underline underline-offset-2"
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
                      {ev.cfpDeadline && <div><span className="text-[#FF8067]/70">CFP</span> {fmt(ev.cfpDeadline)}</div>}
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
    </div>
  );
}
