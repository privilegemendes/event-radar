"use client";

import { useEffect, useState } from "react";

interface EventRef { id: string; title: string; startDate: string | null; }
interface Speaker {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  linkedinUrl: string | null;
  background: string | null;
  topics: string | null;
  region: string | null;
  talkCount: number;
  eventsJson: string | null;
  outreachNote: string | null;
}

const enc = encodeURIComponent;
const salesNavLink = (s: Speaker) =>
  `https://www.linkedin.com/sales/search/people?keywords=${enc([s.name, s.company].filter(Boolean).join(" "))}`;
const linkedinLink = (s: Speaker) =>
  s.linkedinUrl ||
  `https://www.linkedin.com/search/results/people/?keywords=${enc([s.name, s.company].filter(Boolean).join(" "))}`;
/** Opens a LinkedIn message to the person (via their profile handle), else Sales Navigator search. */
const messageLink = (s: Speaker) => {
  const m = s.linkedinUrl?.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m ? `https://www.linkedin.com/messaging/compose/?recipient=${m[1]}` : salesNavLink(s);
};

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[p.length - 1]?.[0] ?? "")).toUpperCase() || "?";
}

const RANK_COLORS = ["#FFD166", "#C0C6CF", "#E0A06B"]; // gold / silver / bronze

export default function SpeakersPage() {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyNote, setBusyNote] = useState<string | null>(null);

  const load = () =>
    fetch("/api/speakers")
      .then((r) => r.json())
      .then((d: Speaker[]) => setSpeakers(Array.isArray(d) ? d : []))
      .catch(() => setSpeakers([]))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    fetch("/api/users").then((r) => { if (r.ok) setIsAdmin(true); }).catch(() => {});
  }, []);

  const discover = async () => {
    setDiscovering(true); setMsg(null);
    try {
      const r = await fetch("/api/speakers/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const d = await r.json();
      if (!r.ok) setMsg(d.error || "Discovery failed");
      else { setMsg(`Found ${d.created} new + ${d.updated} updated from ${d.eventsMined} events.`); await load(); }
    } catch { setMsg("Discovery failed"); }
    finally { setDiscovering(false); }
  };

  const regen = async (id: string, tone: "warm" | "witty" | "thoughtful") => {
    setBusyNote(id);
    try {
      const r = await fetch(`/api/speakers/${id}/note`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tone }) });
      const d = await r.json();
      if (r.ok) setSpeakers((prev) => prev.map((s) => s.id === id ? { ...s, outreachNote: d.outreachNote } : s));
    } catch { /* */ }
    finally { setBusyNote(null); }
  };

  const del = async (id: string) => {
    setSpeakers((prev) => prev.filter((s) => s.id !== id));
    await fetch(`/api/speakers/${id}`, { method: "DELETE" });
  };

  const copyNote = (id: string, note: string) => {
    navigator.clipboard?.writeText(note).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    }).catch(() => {});
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-white">Speakers &amp; Thought Leaders</h1>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/30 mt-1">
            Announced speakers across tracked events · ranked by how often they speak
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={discover}
            disabled={discovering}
            className="px-4 py-1.5 bg-coder-purple hover:bg-coder-purple-hover disabled:opacity-50 text-black text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
          >
            {discovering && <span className="w-3 h-3 border-2 border-black/40 border-t-black rounded-full animate-spin" />}
            {discovering ? "Searching…" : "Find speakers"}
          </button>
        )}
      </div>

      {msg && (
        <div className="mb-4 font-mono text-[11px] text-coder-green bg-coder-green/5 border border-coder-green/20 rounded-lg px-3 py-2">{msg}</div>
      )}

      {loading ? (
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/20 py-16 text-center">Loading…</p>
      ) : speakers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/20 mb-1">No speakers yet</p>
          <p className="font-mono text-[10px] text-white/25">
            {isAdmin ? "Click “Find speakers” to mine announced speakers from upcoming events." : "Ask an admin to run speaker discovery."}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {speakers.map((s, i) => {
            const events: EventRef[] = s.eventsJson ? JSON.parse(s.eventsJson) : [];
            const topics = (s.topics ?? "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 5);
            const rankColor = RANK_COLORS[i] ?? "rgba(255,255,255,0.25)";
            return (
              <div key={s.id} className="bg-coder-panel border border-white/[0.07] rounded-xl p-4">
                <div className="flex items-start gap-3.5">
                  {/* Rank + avatar */}
                  <div className="flex flex-col items-center gap-1 flex-shrink-0 w-11">
                    <span className="font-mono text-[10px] font-bold" style={{ color: rankColor }}>#{i + 1}</span>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-mono text-[12px] font-bold text-white/80 bg-coder-panel-alt border border-white/10">
                      {initials(s.name)}
                    </div>
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <h3 className="font-medium text-white/90 text-sm leading-snug">{s.name}</h3>
                      <span className="font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-coder-cyan/10 text-coder-cyan border border-coder-cyan/20">
                        🎤 {s.talkCount} {s.talkCount === 1 ? "talk" : "talks"}
                      </span>
                      {s.region && <span className="font-mono text-[9px] text-white/30">{s.region}</span>}
                    </div>
                    {(s.title || s.company) && (
                      <p className="font-mono text-[11px] text-white/50 mt-0.5">
                        {[s.title, s.company].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {s.background && <p className="text-[12px] text-white/60 mt-1.5 leading-snug">{s.background}</p>}

                    {topics.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {topics.map((t) => (
                          <span key={t} className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-coder-purple/10 text-coder-purple/70 border border-coder-purple/20">{t}</span>
                        ))}
                      </div>
                    )}

                    {events.length > 0 && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[9px] text-white/30 mt-2">
                        {events.map((e) => (
                          <span key={e.id}>🗓 {e.title}{e.startDate ? ` · ${new Date(e.startDate).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}` : ""}</span>
                        ))}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <a href={linkedinLink(s)} target="_blank" rel="noopener noreferrer"
                        className="font-mono text-[10px] uppercase tracking-[0.06em] px-2.5 py-1 rounded bg-brand-linkedin/15 text-brand-linkedin-fg border border-brand-linkedin/30 hover:bg-brand-linkedin/25 transition-colors">
                        {s.linkedinUrl ? "LinkedIn profile" : "LinkedIn search"} ↗
                      </a>
                      <a href={salesNavLink(s)} target="_blank" rel="noopener noreferrer"
                        className="font-mono text-[10px] uppercase tracking-[0.06em] px-2.5 py-1 rounded bg-coder-cyan/10 text-coder-cyan border border-coder-cyan/25 hover:bg-coder-cyan/20 transition-colors">
                        Sales Navigator ↗
                      </a>
                      <button
                        onClick={() => { if (s.outreachNote) copyNote(s.id, s.outreachNote); window.open(messageLink(s), "_blank", "noopener"); }}
                        title="Opens a LinkedIn message to this person and copies your note to paste"
                        className="font-mono text-[10px] uppercase tracking-[0.06em] px-2.5 py-1 rounded bg-brand-linkedin/15 text-brand-linkedin-fg border border-brand-linkedin/30 hover:bg-brand-linkedin/25 transition-colors">
                        {copiedId === s.id ? "Note copied ✓" : "Message ↗"}
                      </button>
                      {isAdmin && (
                        <button onClick={() => del(s.id)}
                          className="ml-auto font-mono text-[10px] uppercase tracking-[0.06em] px-2 py-1 rounded text-white/25 border border-white/10 hover:text-coder-red hover:border-coder-red/30 transition-colors">
                          Remove
                        </button>
                      )}
                    </div>

                    {/* Outreach note */}
                    <div className="mt-3 bg-coder-panel border border-white/[0.08] rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/30">Personal connection note</span>
                        <div className="flex items-center gap-1.5">
                          {isAdmin && (
                            <>
                              <button onClick={() => regen(s.id, "warm")} disabled={busyNote === s.id}
                                className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded text-coder-green/70 border border-coder-green/20 hover:bg-coder-green/10 disabled:opacity-40 transition-colors" title="Warm & genuine">
                                Warm
                              </button>
                              <button onClick={() => regen(s.id, "witty")} disabled={busyNote === s.id}
                                className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded text-coder-purple/70 border border-coder-purple/20 hover:bg-coder-purple/10 disabled:opacity-40 transition-colors" title="A little witty">
                                Witty
                              </button>
                              <button onClick={() => regen(s.id, "thoughtful")} disabled={busyNote === s.id}
                                className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded text-coder-cyan/70 border border-coder-cyan/20 hover:bg-coder-cyan/10 disabled:opacity-40 transition-colors" title="Thoughtful & sincere">
                                Thoughtful
                              </button>
                            </>
                          )}
                          {s.outreachNote && (
                            <button onClick={() => copyNote(s.id, s.outreachNote!)}
                              className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded text-white/50 border border-white/10 hover:text-white/80 hover:border-white/20 transition-colors">
                              {copiedId === s.id ? "Copied ✓" : "Copy"}
                            </button>
                          )}
                        </div>
                      </div>
                      {busyNote === s.id ? (
                        <p className="font-mono text-[11px] text-white/30">Writing note…</p>
                      ) : s.outreachNote ? (
                        <p className="text-[12px] text-white/70 leading-snug whitespace-pre-wrap">{s.outreachNote}</p>
                      ) : (
                        <p className="font-mono text-[11px] text-white/25">No note yet{isAdmin ? " — pick a style (Warm / Witty / Thoughtful) to generate one." : "."}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="font-mono text-[9px] text-white/20 mt-6 leading-relaxed">
        Note: LinkedIn / Sales Navigator buttons open a pre-filled search (or the profile when found). The Message button opens a LinkedIn message to the person and copies your note to paste. Full Sales Navigator API sync isn’t available without LinkedIn partner access — these deep links are the supported path.
      </p>
    </div>
  );
}
