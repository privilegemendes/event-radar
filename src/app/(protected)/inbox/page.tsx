"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EVENT_TYPE_STYLES, ACTION_STYLES, ACTION_LABELS, scoreColor, PARTNER_REGIONS, REGION_STYLES } from "@/lib/constants";
import EventAvatar, { TypeIcon } from "@/components/EventAvatar";

interface Event {
  id: string;
  title: string;
  type: string;
  status: string;
  cfpDeadline: string | null;
  startDate: string | null;
  location: string | null;
  isOnline: boolean;
  region: string | null;
  coderRelevant: boolean;
  sourceNote: string | null;
  partner: { name: string; region: string | null } | null;
  industry: string | null;
  relevancyScore: number | null;
  relevancyRationale: string | null;
  suggestedAction: string | null;
}

interface DiscoveryRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  summary: string | null;
  found: number;
}

export default function InboxPage() {
  const [events,    setEvents]    = useState<Event[]>([]);
  const [lastRun,   setLastRun]   = useState<DiscoveryRun | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [running,   setRunning]   = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState<string | null>(null);
  const [isAdmin,   setIsAdmin]   = useState(false);
  const [canReview, setCanReview] = useState(false);
  const [partnerRegionFilter, setPartnerRegionFilter] = useState("");

  const loadData = async () => {
    const [evRes, runRes] = await Promise.all([
      fetch("/api/events?status=DISCOVERED"),
      fetch("/api/discovery"),
    ]);
    const evData  = (await evRes.json())  as Event[];
    const runData = (await runRes.json()) as DiscoveryRun | null;
    setEvents(Array.isArray(evData) ? evData : []);
    setLastRun(runData);
  };

  useEffect(() => {
    fetch("/api/users").then((r) => { if (r.ok) setIsAdmin(true); }).catch(() => {});
    fetch("/api/auth/me").then((r) => r.json()).then((d) => { if (d?.authenticated) setCanReview(true); }).catch(() => {});
    loadData().finally(() => setLoading(false));
  }, []);

  const runDiscovery = async () => {
    setRunning(true);
    try {
      const res  = await fetch("/api/discovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = (await res.json()) as { found?: number; error?: string };
      await loadData();
      if (data.error) alert(`Discovery error: ${data.error}`);
    } finally {
      setRunning(false);
    }
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    setAnalyzeMsg(null);
    try {
      const res  = await fetch("/api/events/analyze", { method: "POST" });
      const data = (await res.json()) as { message?: string; error?: string; updated?: number };
      if (data.error) {
        setAnalyzeMsg(`Error: ${data.error}`);
      } else {
        setAnalyzeMsg(data.message ?? `Updated ${data.updated ?? 0} events`);
        await loadData();
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const updateStatus = async (id: string, status: "APPROVED" | "REJECTED") => {
    await fetch(`/api/events/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setEvents((prev) => prev.filter((e) => e.id !== id));
  };

  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;

  // Partner-event region sub-filter (only applies to events linked to a partner)
  const evRegions = (e: Event) => (e.partner?.region ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const partnerEventCount = events.filter((e) => e.partner).length;
  const regionsPresent = PARTNER_REGIONS.filter((r) => events.some((e) => evRegions(e).includes(r)));
  const shown = partnerRegionFilter
    ? events.filter((e) => evRegions(e).includes(partnerRegionFilter))
    : events;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Discovery Inbox</h1>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/30 mt-1">
            Review auto-discovered events
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2 flex-wrap">
            {/* Re-analyze button */}
            <button
              onClick={runAnalysis}
              disabled={analyzing || running}
              className="flex items-center gap-2 px-3 py-2 border border-[#01F2FF]/30 text-[#01F2FF]/80 hover:text-[#01F2FF] hover:border-[#01F2FF]/60 font-mono text-[9px] uppercase tracking-[0.08em] rounded-lg transition-all disabled:opacity-40"
            >
              {analyzing ? (
                <><span className="animate-spin w-3 h-3 border border-[#01F2FF]/30 border-t-[#01F2FF] rounded-full inline-block" />Analyzing…</>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M10 6A4 4 0 1 1 6 2"/><path d="M10 2v4h-4"/>
                  </svg>
                  Re-analyze events
                </>
              )}
            </button>

            {/* Run Discovery button */}
            <button
              onClick={runDiscovery}
              disabled={running || analyzing}
              className="flex items-center gap-2 px-4 py-2 bg-[#BC7CFF] hover:bg-[#CA96FF] disabled:opacity-50 text-black text-sm font-semibold rounded-lg transition-colors"
            >
              {running ? (
                <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-black/25 border-t-black rounded-full" /><span className="font-mono text-[10px] uppercase tracking-[0.08em]">Running…</span></>
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-[0.08em]">Run Discovery</span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Analyze result */}
      {analyzeMsg && (
        <div className={`mb-4 p-3 rounded-xl border text-sm flex items-center gap-2 ${analyzeMsg.startsWith("Error") ? "bg-[#FF8067]/5 border-[#FF8067]/20 text-[#FF8067]" : "bg-[#01F2FF]/5 border-[#01F2FF]/20 text-[#01F2FF]"}`}>
          <span>{analyzeMsg.startsWith("Error") ? "✗" : "✓"}</span>
          <span className="font-mono text-[10px]">{analyzeMsg}</span>
          <button onClick={() => setAnalyzeMsg(null)} className="ml-auto opacity-50 hover:opacity-100 font-mono text-xs">✕</button>
        </div>
      )}

      {/* Last run info */}
      {lastRun && (
        <div className={`mb-5 p-3.5 rounded-xl border text-sm flex items-start gap-3 ${
          lastRun.status === "DONE" ? "bg-[#66FFAB]/5 border-[#66FFAB]/20 text-[#66FFAB]"
          : lastRun.status === "ERROR" ? "bg-[#FF8067]/5 border-[#FF8067]/20 text-[#FF8067]"
          : "bg-[#01F2FF]/5 border-[#01F2FF]/20 text-[#01F2FF]"
        }`}>
          <span className="text-base flex-shrink-0">{lastRun.status === "DONE" ? "✓" : lastRun.status === "ERROR" ? "✗" : "⟳"}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] font-semibold">Last run: {lastRun.status}</span>
              <span className="font-mono text-[10px] opacity-50 ml-auto">{fmt(lastRun.startedAt)}</span>
            </div>
            {lastRun.summary && <p className="text-xs mt-0.5 opacity-70">{lastRun.summary}</p>}
          </div>
        </div>
      )}

      {/* Partner-event region sub-filter */}
      {partnerEventCount > 0 && regionsPresent.length > 0 && (
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/30 mr-1">Partner events:</span>
          <button
            onClick={() => setPartnerRegionFilter("")}
            className={`font-mono text-[9px] uppercase tracking-[0.08em] px-2 py-1 rounded border transition-colors ${partnerRegionFilter === "" ? "bg-white/10 text-white/80 border-white/20" : "bg-white/[0.02] text-white/40 border-white/10 hover:text-white/70"}`}
          >
            All
          </button>
          {regionsPresent.map((r) => (
            <button
              key={r}
              onClick={() => setPartnerRegionFilter(partnerRegionFilter === r ? "" : r)}
              className={`font-mono text-[9px] uppercase tracking-[0.08em] px-2 py-1 rounded transition-colors ${partnerRegionFilter === r ? REGION_STYLES[r] : "bg-white/[0.02] text-white/40 border border-white/10 hover:text-white/70"}`}
            >
              {r} ({events.filter((e) => evRegions(e).includes(r)).length})
            </button>
          ))}
        </div>
      )}

      {/* Events */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-white/30 font-mono text-sm">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div
            className="flex items-center justify-center w-24 h-24 rounded-2xl mb-5"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <TypeIcon type="PODCAST" color="rgba(188,124,255,0.22)" size={44} />
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/20">
            {partnerRegionFilter ? `No ${partnerRegionFilter} partner events in inbox` : "Inbox empty — all events reviewed"}
          </p>
          {partnerRegionFilter ? (
            <button onClick={() => setPartnerRegionFilter("")} className="mt-4 font-mono text-[10px] text-[#BC7CFF]/60 hover:text-[#BC7CFF] uppercase tracking-widest transition-colors">
              Clear filter
            </button>
          ) : isAdmin && (
            <button onClick={runDiscovery} className="mt-4 font-mono text-[10px] text-[#BC7CFF]/60 hover:text-[#BC7CFF] uppercase tracking-widest transition-colors">
              Run discovery
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((ev) => (
            <div key={ev.id} className="bg-[#101314] border border-white/[0.07] rounded-xl p-4">
              <div className="flex items-start gap-3">
                <EventAvatar event={ev} size={40} />
                <div className="flex-1 min-w-0">
                  {/* Chips */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                    <span className={`font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded ${EVENT_TYPE_STYLES[ev.type]}`}>{ev.type}</span>
                    {ev.suggestedAction && ACTION_STYLES[ev.suggestedAction] && (
                      <span className={`font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded ${ACTION_STYLES[ev.suggestedAction]}`} title={ev.suggestedAction}>
                        {ACTION_LABELS[ev.suggestedAction] ?? ev.suggestedAction}
                      </span>
                    )}
                    {ev.industry && (
                      <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[#BC7CFF]/10 text-[#BC7CFF]/70 border border-[#BC7CFF]/20">{ev.industry}</span>
                    )}
                    {ev.relevancyScore != null && (
                      <span className={`font-mono text-[9px] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded font-bold ${scoreColor(ev.relevancyScore)}`} title={ev.relevancyRationale ?? ""}>
                        {ev.relevancyScore}/100
                      </span>
                    )}
                    {ev.coderRelevant && (
                      <span className="font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-[#BC7CFF]/15 text-[#BC7CFF] border border-[#BC7CFF]/30">Coder</span>
                    )}
                    {ev.region && <span className="font-mono text-[9px] text-white/30">{ev.region}</span>}
                  </div>

                  <Link href={`/events/${ev.id}`} className="font-medium text-white/90 hover:text-white transition-colors text-sm">
                    {ev.title}
                  </Link>

                  {ev.relevancyRationale && (
                    <p className="font-mono text-[9px] text-white/35 mt-1 leading-relaxed">{ev.relevancyRationale}</p>
                  )}

                  <div className="flex flex-wrap gap-3 mt-1 font-mono text-[10px] text-white/30">
                    {ev.location && <span>📍 {ev.location}</span>}
                    {ev.isOnline && !ev.location && <span>🌐 Online</span>}
                    {ev.cfpDeadline && <span className="text-[#FF8067]">CFP: {fmt(ev.cfpDeadline)}</span>}
                    {ev.startDate && <span>{fmt(ev.startDate)}</span>}
                    {ev.partner && <span>🤝 {ev.partner.name}{ev.partner.region ? ` · ${ev.partner.region}` : ""}</span>}
                  </div>

                  {ev.sourceNote && (
                    <p className="font-mono text-[9px] text-white/35 mt-1.5 flex items-center gap-1">
                      <span className="text-white/20">↳</span>
                      <span className="truncate">{ev.sourceNote}</span>
                    </p>
                  )}
                </div>
                {canReview && (
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button onClick={() => updateStatus(ev.id, "APPROVED")} className="px-3 py-1.5 bg-[#66FFAB]/10 hover:bg-[#66FFAB]/20 text-[#66FFAB] border border-[#66FFAB]/25 font-mono text-[9px] uppercase tracking-[0.08em] rounded-lg transition-colors">Approve</button>
                    <button onClick={() => updateStatus(ev.id, "REJECTED")} className="px-3 py-1.5 bg-[#FF8067]/10 hover:bg-[#FF8067]/20 text-[#FF8067] border border-[#FF8067]/25 font-mono text-[9px] uppercase tracking-[0.08em] rounded-lg transition-colors">Reject</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
