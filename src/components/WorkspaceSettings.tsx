"use client";

import { useEffect, useState } from "react";

/**
 * Workspace settings shared by every speaker: automatic discovery and the work
 * calendar.
 *
 * Admin-only, and deliberately so. Discovery spends money and writes rows
 * everyone sees, and the calendar ICS URL grants read access to a whole
 * calendar. The per-speaker half moved to /profile — see ProfileSettings.
 */

const inputCls =
  "w-full px-3 py-2.5 bg-coder-control border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-coder-purple focus:ring-1 focus:ring-coder-purple transition-colors";

export default function WorkspaceSettings() {
  const [cal, setCal] = useState<{ configured: boolean; masked: string; fromEnv?: boolean } | null>(null);
  const [icsInput, setIcsInput] = useState("");
  const [savingCal, setSavingCal] = useState(false);

  const [auto, setAuto] = useState<{ enabled: boolean; lastRun: { status: string; summary: string | null; startedAt: string; found: number } | null } | null>(null);

  useEffect(() => {
    fetch("/api/settings/calendar").then((r) => (r.ok ? r.json() : null)).then(setCal).catch(() => {});
    fetch("/api/settings/auto-discovery").then((r) => (r.ok ? r.json() : null)).then(setAuto).catch(() => {});
  }, []);

  const toggleAuto = async () => {
    if (!auto) return;
    const next = !auto.enabled;
    setAuto({ ...auto, enabled: next });
    await fetch("/api/settings/auto-discovery", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
  };

  const saveCalendar = async () => {
    setSavingCal(true);
    const res = await fetch("/api/settings/calendar", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: icsInput }),
    });
    if (res.ok) {
      setCal(await res.json());
      setIcsInput("");
    }
    setSavingCal(false);
  };

  const clearCalendar = async () => {
    if (!confirm("Remove the connected calendar?")) return;
    setSavingCal(true);
    const res = await fetch("/api/settings/calendar", { method: "DELETE" });
    if (res.ok) setCal({ configured: false, masked: "" });
    setSavingCal(false);
  };

  return (
    <>
      {/* Automatic Discovery */}
      <div className="bg-coder-panel border border-white/[0.08] rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/40">Automatic Discovery</p>
          {auto && (
            <button
              onClick={toggleAuto}
              role="switch"
              aria-checked={auto.enabled}
              className={`relative w-11 h-6 rounded-full transition-colors ${auto.enabled ? "bg-coder-green" : "bg-white/15"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-black transition-transform ${auto.enabled ? "translate-x-5" : ""}`} />
            </button>
          )}
        </div>
        <p className="text-sm text-white/50 mb-3">
          When on, Event Radar keeps searching the web for new events on a schedule and drops them into your Inbox.
          Each run rotates its focus (Women-in-Tech, founder meetups, AI podcasts, etc.) and skips duplicates.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded ${auto?.enabled ? "bg-coder-green/15 text-coder-green border border-coder-green/30" : "bg-white/5 text-white/40 border border-white/10"}`}>
            {auto?.enabled ? "On" : "Off"}
          </span>
          {auto?.lastRun && (
            <span className="font-mono text-[9px] text-white/30">
              Last run: {new Date(auto.lastRun.startedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              {" · "}{auto.lastRun.status}{auto.lastRun.found ? ` · +${auto.lastRun.found}` : ""}
            </span>
          )}
        </div>
        <p className="font-mono text-[9px] text-white/25 mt-3 leading-relaxed">
          In production this is driven by a Vercel Cron job (weekly — see <code>vercel.json</code>); set a
          <code> CRON_SECRET</code> env var to lock the endpoint down. You can still run discovery on demand from the Inbox.
        </p>
      </div>


      {/* Work Calendar */}
      <div className="bg-coder-panel border border-white/[0.08] rounded-xl p-5 mb-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/40 mb-1">Work Calendar</p>
        <p className="text-sm text-white/50 mb-4">
          Connect a <span className="text-white/70">read-only</span> Google Calendar ICS feed to see whether you&rsquo;re
          free for an event. In Google Calendar: Settings → your calendar → <em>Secret address in iCal format</em>.
        </p>

        <div className="rounded-lg bg-coder-coral/8 border border-coder-coral/20 p-3 mb-4">
          <p className="font-mono text-[10px] text-coder-coral/90 leading-relaxed">
            ⚠ This URL is a secret — anyone with it can read your whole calendar. It is stored server-side, never shown
            in full, and never committed to the repo. In production, set it as the <code>WORK_CALENDAR_ICS_URL</code>{" "}
            environment variable instead.
          </p>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-white/35">Status:</span>
          {cal?.configured ? (
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-coder-green/15 text-coder-green border border-coder-green/30">
              Connected{cal.fromEnv ? " (env var)" : ""}
            </span>
          ) : (
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-white/5 text-white/40 border border-white/10">
              Not connected
            </span>
          )}
          {cal?.configured && cal.masked && (
            <span className="font-mono text-[9px] text-white/25">{cal.masked}</span>
          )}
        </div>

        {!cal?.fromEnv && (
          <div className="flex flex-wrap gap-2">
            <input
              type="password"
              className={`${inputCls} flex-1 min-w-60`}
              value={icsInput}
              onChange={(e) => setIcsInput(e.target.value)}
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
            />
            <button
              onClick={saveCalendar}
              disabled={savingCal || !icsInput.trim()}
              className="px-4 py-2 bg-coder-purple hover:bg-coder-purple-hover disabled:opacity-50 text-black font-semibold text-sm rounded-lg transition-colors"
            >
              {savingCal ? "…" : cal?.configured ? "Replace" : "Connect"}
            </button>
            {cal?.configured && (
              <button
                onClick={clearCalendar}
                disabled={savingCal}
                className="px-4 py-2 text-sm text-coder-coral/70 hover:text-coder-coral border border-coder-coral/20 hover:border-coder-coral/40 rounded-lg transition-colors"
              >
                Disconnect
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
