"use client";

import { useEffect, useState } from "react";
import { PARTNER_STAGES, PARTNER_CATEGORIES, PARTNER_REGIONS, PARTNER_TIERS, REGION_STYLES } from "@/lib/constants";

interface Partner {
  id: string; name: string; category: string; stage: string;
  stageStatus: string; country: string; keyContact: string; notes: string;
  region: string | null; tier: string | null;
  _count: { events: number };
}

interface BulkProgress {
  current: number;
  total: number;
  name: string;
}

interface BulkResult {
  found: number;
  errors: number;
  ran: number;
}

const ENGAGED_STAGES = ["Signed", "Close to Sign", "Warm Engagement", "Alliance"];

const inputCls =
  "w-full px-3 py-2 bg-coder-control border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-coder-purple focus:ring-1 focus:ring-coder-purple transition-colors";

const STAGE_COLOR: Record<string, string> = {
  "Signed":           "text-coder-green",
  "Close to Sign":    "text-coder-cyan",
  "Warm Engagement":  "text-coder-pink",
  "To Be Outreached": "text-white/30",
};

export default function PartnersPage() {
  const [partners,     setPartners]     = useState<Partner[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [isAdmin,      setIsAdmin]      = useState(false);
  const [search,       setSearch]       = useState("");
  const [stageFilter,  setStageFilter]  = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [showAdd,      setShowAdd]      = useState(false);
  const [running,      setRunning]      = useState<string | null>(null);

  // Bulk discovery state
  const [bulkRunning,  setBulkRunning]  = useState(false);
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null);
  const [bulkResult,   setBulkResult]   = useState<BulkResult | null>(null);

  const [np, setNp] = useState({
    name: "", category: "GSI", stage: "To Be Outreached",
    stageStatus: "", country: "", keyContact: "", notes: "", region: "EMEA", tier: "",
  });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d: { role?: string }) => setIsAdmin(d?.role === "ADMIN")).catch(() => setIsAdmin(false));
    fetch("/api/partners")
      .then((r) => r.json())
      .then((d: Partner[]) => setPartners(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = partners.filter((p) => {
    const q = search.toLowerCase();
    return (
      (!search || p.name.toLowerCase().includes(q) || p.country.toLowerCase().includes(q) || p.keyContact.toLowerCase().includes(q))
      && (!stageFilter || p.stage === stageFilter)
      && (!regionFilter || (p.region ?? "").split(",").map((r) => r.trim()).includes(regionFilter))
    );
  });

  const addPartner = async () => {
    if (!np.name) return;
    setAdding(true);
    const res = await fetch("/api/partners", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(np),
    });
    if (res.ok) {
      const p = (await res.json()) as Partner;
      setPartners((prev) => [...prev, { ...p, _count: { events: 0 } }]);
      setNp({ name: "", category: "GSI", stage: "To Be Outreached", stageStatus: "", country: "", keyContact: "", notes: "", region: "EMEA", tier: "" });
      setShowAdd(false);
    }
    setAdding(false);
  };

  const findEvents = async (partnerId: string) => {
    setRunning(partnerId);
    const res  = await fetch("/api/discovery", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerId }),
    });
    const data = (await res.json()) as { found?: number; error?: string };
    setRunning(null);
    if (data.error) alert(`Discovery error: ${data.error}`);
    else alert(`Discovery complete: found ${data.found ?? 0} new event(s)`);
  };

  /* ── Bulk discovery: all engaged partners sequentially ── */
  const findAllEngaged = async () => {
    const engaged = partners.filter((p) => ENGAGED_STAGES.includes(p.stage));
    if (engaged.length === 0) { alert("No engaged partners found."); return; }

    setBulkRunning(true);
    setBulkResult(null);

    let totalFound = 0;
    let errors     = 0;

    for (let i = 0; i < engaged.length; i++) {
      const p = engaged[i];
      setBulkProgress({ current: i + 1, total: engaged.length, name: p.name });

      try {
        const res  = await fetch("/api/discovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ partnerId: p.id }),
        });
        const data = (await res.json()) as { found?: number; error?: string };
        if (data.error) errors++;
        else totalFound += data.found ?? 0;
      } catch {
        errors++;
      }
    }

    setBulkProgress(null);
    setBulkRunning(false);
    setBulkResult({ found: totalFound, errors, ran: engaged.length });
  };

  const snp = (k: string, v: string) => setNp((p) => ({ ...p, [k]: v }));

  const engagedCount = partners.filter((p) => ENGAGED_STAGES.includes(p.stage)).length;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-white">Partners</h1>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/30 mt-1">
            Coder Global Partner Ecosystem
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {isAdmin && engagedCount > 0 && (
            <button
              onClick={findAllEngaged}
              disabled={bulkRunning || !!running}
              className="flex items-center gap-2 px-3 py-2 border border-coder-purple/30 text-coder-purple/80 hover:text-coder-purple hover:border-coder-purple/60 font-mono text-[9px] uppercase tracking-[0.08em] rounded-lg transition-all disabled:opacity-40"
            >
              {bulkRunning ? (
                <>
                  <span className="animate-spin w-3 h-3 border border-coder-purple/30 border-t-coder-purple rounded-full inline-block" />
                  Scanning…
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <circle cx="6" cy="6" r="5"/>
                    <path d="M4 6l1.5 1.5L8 4"/>
                  </svg>
                  Find events for all engaged ({engagedCount})
                </>
              )}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="px-4 py-2 bg-coder-purple hover:bg-coder-purple-hover text-black text-sm font-semibold rounded-lg transition-colors"
            >
              {showAdd ? "Cancel" : "+ Add Partner"}
            </button>
          )}
        </div>
      </div>

      {/* Bulk progress bar */}
      {bulkRunning && bulkProgress && (
        <div className="mb-4 bg-coder-panel border border-coder-purple/20 rounded-xl p-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] text-coder-purple">
              {bulkProgress.current}/{bulkProgress.total} — {bulkProgress.name}
            </span>
            <span className="font-mono text-[9px] text-white/30 uppercase tracking-widest">Running discovery…</span>
          </div>
          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-coder-purple rounded-full transition-all duration-300"
              style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Bulk result summary */}
      {bulkResult && !bulkRunning && (
        <div className={`mb-4 p-3.5 rounded-xl border flex items-center gap-3 ${
          bulkResult.errors === 0
            ? "bg-coder-green/5 border-coder-green/20 text-coder-green"
            : "bg-coder-coral/5 border-coder-coral/20 text-coder-coral"
        }`}>
          <span className="text-base">{bulkResult.errors === 0 ? "✓" : "⚠"}</span>
          <div className="flex-1">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em]">
              Discovery complete — {bulkResult.found} new event{bulkResult.found !== 1 ? "s" : ""} found
            </span>
            <span className="font-mono text-[9px] opacity-60 ml-2">
              across {bulkResult.ran} partners{bulkResult.errors > 0 ? ` · ${bulkResult.errors} error(s)` : ""}
            </span>
          </div>
          <button
            onClick={() => setBulkResult(null)}
            className="opacity-50 hover:opacity-100 transition-opacity font-mono text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Add partner form */}
      {showAdd && isAdmin && (
        <div className="bg-coder-panel border border-white/[0.08] rounded-xl p-4 mb-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {([
            ["Name *",       "name",        "Acme Corp"],
            ["Country",      "country",     "UK"],
            ["Key Contact",  "keyContact",  "Jane Smith"],
            ["Stage Status", "stageStatus", "Initial call done"],
            ["Notes",        "notes",       "Notes…"],
          ] as const).map(([label, key, placeholder]) => (
            <div key={key}>
              <label className="block font-mono text-[9px] uppercase tracking-[0.1em] text-white/40 mb-1.5">{label}</label>
              <input
                className={inputCls}
                value={np[key as keyof typeof np]}
                onChange={(e) => snp(key as string, e.target.value)}
                placeholder={placeholder}
              />
            </div>
          ))}
          <div>
            <label className="block font-mono text-[9px] uppercase tracking-[0.1em] text-white/40 mb-1.5">Category</label>
            <select className={inputCls} value={np.category} onChange={(e) => snp("category", e.target.value)}>
              {PARTNER_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block font-mono text-[9px] uppercase tracking-[0.1em] text-white/40 mb-1.5">Stage</label>
            <select className={inputCls} value={np.stage} onChange={(e) => snp("stage", e.target.value)}>
              {PARTNER_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block font-mono text-[9px] uppercase tracking-[0.1em] text-white/40 mb-1.5">Region</label>
            <select className={inputCls} value={np.region} onChange={(e) => snp("region", e.target.value)}>
              {PARTNER_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block font-mono text-[9px] uppercase tracking-[0.1em] text-white/40 mb-1.5">Tier</label>
            <select className={inputCls} value={np.tier} onChange={(e) => snp("tier", e.target.value)}>
              <option value="">—</option>
              {PARTNER_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2 md:col-span-3 flex justify-end">
            <button
              onClick={addPartner}
              disabled={adding || !np.name}
              className="px-5 py-2 bg-coder-purple hover:bg-coder-purple-hover disabled:opacity-50 text-black text-sm font-semibold rounded-lg transition-colors"
            >
              {adding ? "Adding…" : "Add Partner"}
            </button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          type="text" placeholder="Search partners…" value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-40 px-3 py-1.5 bg-coder-control border border-white/10 rounded-lg text-sm text-white/80 placeholder-white/20 focus:outline-none focus:border-coder-purple focus:ring-1 focus:ring-coder-purple transition-colors"
        />
        <select
          value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}
          className="px-3 py-1.5 bg-coder-control border border-white/10 rounded-lg font-mono text-[10px] uppercase tracking-[0.06em] text-white/50 focus:outline-none focus:border-coder-purple"
        >
          <option value="">All regions</option>
          {PARTNER_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select
          value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}
          className="px-3 py-1.5 bg-coder-control border border-white/10 rounded-lg font-mono text-[10px] uppercase tracking-[0.06em] text-white/50 focus:outline-none focus:border-coder-purple"
        >
          <option value="">All stages</option>
          {PARTNER_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-white/30 font-mono text-sm">Loading…</div>
      ) : (
        <div className="bg-coder-panel border border-white/[0.08] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.07]">
                  {["Name","Region","Tier","Category","Stage","Country","Contact","Events", ...(isAdmin ? [""] : [])].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-mono text-[9px] uppercase tracking-[0.1em] text-white/30">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white/90">{p.name}</div>
                      {p.notes && (
                        <div className="font-mono text-[9px] text-white/25 mt-0.5 max-w-xs truncate">{p.notes}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.region && (
                        <div className="flex flex-wrap gap-1">
                          {p.region.split(",").map((r) => r.trim()).filter(Boolean).map((r) => (
                            <span key={r} className={`font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded ${REGION_STYLES[r] ?? "bg-white/5 text-white/50 border border-white/10"}`}>
                              {r}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-white/40">{p.tier || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 bg-white/5 text-white/50 border border-white/10 rounded">
                        {p.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className={`font-mono text-[10px] font-semibold ${STAGE_COLOR[p.stage] ?? "text-white/40"}`}>{p.stage}</div>
                      <div className="font-mono text-[9px] text-white/25 mt-0.5">{p.stageStatus}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-white/40">{p.country}</td>
                    <td className="px-4 py-3 font-mono text-[10px] text-white/40">{p.keyContact || "—"}</td>
                    <td className="px-4 py-3 font-mono text-[10px] text-white/30">{p._count.events}</td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => findEvents(p.id)}
                          disabled={running === p.id || bulkRunning}
                          className="font-mono text-[9px] uppercase tracking-[0.06em] px-2 py-1 text-coder-purple/70 hover:text-coder-purple border border-coder-purple/20 hover:border-coder-purple/40 rounded transition-colors disabled:opacity-30"
                        >
                          {running === p.id ? "…" : "Find events"}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 9 : 8} className="px-4 py-10 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-white/20">
                      No partners found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-white/[0.05] flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-white/20">
              {filtered.length} / {partners.length} partners
            </span>
            {isAdmin && engagedCount > 0 && (
              <span className="font-mono text-[9px] text-white/20">
                {engagedCount} engaged (Signed / Close to Sign / Warm)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
