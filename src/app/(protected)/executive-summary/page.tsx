"use client";

import { useEffect, useState } from "react";

interface Stats {
  totals: { events: number; speakers: number; partners: number; upcoming: number };
  byMacro: Record<string, number>;
  byType: Record<string, number>;
  byTrack: Record<string, number>;
  byCost: Record<string, number>;
  byAction: Record<string, number>;
  topCities: [string, number][];
  topEvents: { title: string; city: string | null; region: string | null; startDate: string | null; score: number | null; action: string | null; url: string | null }[];
  regionTrack: Record<string, Record<string, number>>;
}

/* Tiny Markdown renderer (headings, bullets, bold, paragraphs). */
function Markdown({ md }: { md: string }) {
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      out.push(
        <ul key={`ul-${out.length}`} className="list-disc pl-5 space-y-1 my-2 text-white/75 text-sm">
          {bullets.map((b, i) => <li key={i} dangerouslySetInnerHTML={{ __html: inline(b) }} />)}
        </ul>
      );
      bullets = [];
    }
  };
  const inline = (s: string) =>
    s.replace(/\*\*([^*]+)\*\*/g, "<strong class='text-white'>$1</strong>").replace(/`([^`]+)`/g, "<code class='text-[#01F2FF]'>$1</code>");
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^##\s+/.test(line)) { flush(); out.push(<h2 key={out.length} className="text-[#BC7CFF] font-semibold text-base mt-6 mb-2">{line.replace(/^##\s+/, "")}</h2>); }
    else if (/^###\s+/.test(line)) { flush(); out.push(<h3 key={out.length} className="text-white/90 font-semibold text-sm mt-4 mb-1">{line.replace(/^###\s+/, "")}</h3>); }
    else if (/^[-*]\s+/.test(line)) { bullets.push(line.replace(/^[-*]\s+/, "")); }
    else if (line.trim() === "") { flush(); }
    else { flush(); out.push(<p key={out.length} className="text-white/75 text-sm my-2 leading-relaxed" dangerouslySetInnerHTML={{ __html: inline(line) }} />); }
  }
  flush();
  return <div>{out}</div>;
}

const Bar = ({ data, accent }: { data: [string, number][]; accent: string }) => {
  const max = Math.max(1, ...data.map(([, n]) => n));
  return (
    <div className="space-y-1.5">
      {data.map(([k, n]) => (
        <div key={k} className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-white/50 w-32 truncate flex-shrink-0">{k}</span>
          <div className="flex-1 h-2 bg-white/5 rounded overflow-hidden"><div className="h-full rounded" style={{ width: `${(n / max) * 100}%`, background: accent }} /></div>
          <span className="font-mono text-[10px] text-white/60 w-8 text-right">{n}</span>
        </div>
      ))}
    </div>
  );
};

export default function ExecutiveSummaryPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await fetch("/api/executive-summary");
    const d = await r.json();
    setStats(d.stats); setSummary(d.summary); setGeneratedAt(d.generatedAt);
  };
  useEffect(() => {
    load();
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setIsAdmin(d?.role === "ADMIN")).catch(() => {});
  }, []);

  const regenerate = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/executive-summary", { method: "POST" });
      const d = await r.json();
      if (d.error) alert(d.error); else { setSummary(d.summary); setGeneratedAt(d.generatedAt); setStats(d.stats); }
    } finally { setBusy(false); }
  };

  const card = "bg-[#101314] border border-white/[0.07] rounded-xl p-4";
  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Executive Summary & Recommendations</h1>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/30 mt-1">
            AI-generated strategy over all Event Radar data{generatedAt ? ` · updated ${new Date(generatedAt).toLocaleString("en-GB")}` : ""}
          </p>
        </div>
        {isAdmin && (
          <button onClick={regenerate} disabled={busy}
            className="flex items-center gap-2 px-4 py-2 bg-[#BC7CFF] hover:bg-[#CA96FF] disabled:opacity-50 text-black text-sm font-semibold rounded-lg transition-colors">
            {busy ? <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-black/25 border-t-black rounded-full" /><span className="font-mono text-[10px] uppercase tracking-[0.08em]">Generating…</span></> : <span className="font-mono text-[10px] uppercase tracking-[0.08em]">Regenerate summary</span>}
          </button>
        )}
      </div>

      {/* Totals */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[["Events", stats.totals.events], ["Upcoming", stats.totals.upcoming], ["Speakers", stats.totals.speakers], ["Partners", stats.totals.partners]].map(([l, v]) => (
            <div key={l as string} className={card}><p className="text-3xl font-bold font-mono text-white">{v as number}</p><p className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/30 mt-1">{l as string}</p></div>
          ))}
        </div>
      )}

      {/* Breakdowns */}
      {stats && (
        <div className="grid md:grid-cols-2 gap-3 mb-5">
          <div className={card}><h3 className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/40 mb-3">By macro region</h3><Bar data={Object.entries(stats.byMacro).sort((a, b) => b[1] - a[1])} accent="#BC7CFF" /></div>
          <div className={card}><h3 className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/40 mb-3">Top cities</h3><Bar data={stats.topCities} accent="#01F2FF" /></div>
          <div className={card}><h3 className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/40 mb-3">By track</h3><Bar data={Object.entries(stats.byTrack).sort((a, b) => b[1] - a[1])} accent="#66FFAB" /></div>
          <div className={card}><h3 className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/40 mb-3">Cost / access</h3><Bar data={Object.entries(stats.byCost).sort((a, b) => b[1] - a[1])} accent="#FF8067" /></div>
        </div>
      )}

      {/* AI summary */}
      <div className={card}>
        {summary ? <Markdown md={summary} /> : (
          <div className="py-12 text-center">
            <p className="text-white/40 text-sm">No summary generated yet.</p>
            {isAdmin && <p className="font-mono text-[10px] text-white/30 mt-2">Click “Regenerate summary” to create one.</p>}
          </div>
        )}
      </div>

      {/* Top events */}
      {stats && stats.topEvents.length > 0 && (
        <div className={`${card} mt-4`}>
          <h3 className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/40 mb-3">Highest-relevancy upcoming events</h3>
          <div className="space-y-1.5">
            {stats.topEvents.map((e, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="font-mono text-[10px] font-bold text-[#66FFAB] w-8">{e.score}</span>
                <span className="text-white/85 flex-1 min-w-0 truncate">{e.title}</span>
                <span className="font-mono text-[10px] text-white/40 flex-shrink-0">{[e.city, e.region].filter(Boolean).join(" · ")}</span>
                <span className="font-mono text-[10px] text-white/30 w-20 text-right flex-shrink-0">{e.startDate ? new Date(e.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
