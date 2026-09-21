"use client";

import { useEffect, useState } from "react";
import type { ApplicantProfile } from "@/lib/settings";

const inputCls =
  "w-full px-3 py-2.5 bg-[#0D1011] border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#BC7CFF] focus:ring-1 focus:ring-[#BC7CFF] transition-colors";
const labelCls = "block font-mono text-[9px] uppercase tracking-[0.1em] text-white/40 mb-1.5";

const TEXT_FIELDS: { key: keyof ApplicantProfile; label: string; ph?: string; full?: boolean }[] = [
  { key: "fullName", label: "Full name", ph: "Irmak Eyiceoglu" },
  { key: "pronouns", label: "Pronouns", ph: "she/her" },
  { key: "jobTitle", label: "Job title", ph: "EMEA Partner Manager" },
  { key: "company", label: "Company", ph: "Coder" },
  { key: "email", label: "Email", ph: "irmak@coder.com" },
  { key: "phone", label: "Phone", ph: "+31 …" },
  { key: "location", label: "Location", ph: "Amsterdam, NL" },
  { key: "linkedin", label: "LinkedIn URL", ph: "https://linkedin.com/in/…" },
  { key: "twitter", label: "Twitter / X", ph: "@…" },
  { key: "website", label: "Website", ph: "https://…" },
  { key: "headshotUrl", label: "Headshot URL", ph: "https://… .jpg", full: true },
];

const TEXTAREA_FIELDS: { key: keyof ApplicantProfile; label: string; ph?: string }[] = [
  { key: "bioShort", label: "Short bio (1–2 sentences)" },
  { key: "bioLong", label: "Long bio" },
  { key: "talkTopics", label: "Talk topics / abstracts" },
  { key: "dietary", label: "Dietary / accessibility needs" },
];

export default function ProfileCalendarSettings() {
  const [profile, setProfile] = useState<ApplicantProfile | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  const [cal, setCal] = useState<{ configured: boolean; masked: string; fromEnv?: boolean } | null>(null);
  const [icsInput, setIcsInput] = useState("");
  const [savingCal, setSavingCal] = useState(false);

  const [auto, setAuto] = useState<{ enabled: boolean; lastRun: { status: string; summary: string | null; startedAt: string; found: number } | null } | null>(null);

  useEffect(() => {
    fetch("/api/settings/profile").then((r) => (r.ok ? r.json() : null)).then(setProfile).catch(() => {});
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

  const setField = (key: keyof ApplicantProfile, value: string) =>
    setProfile((p) => (p ? { ...p, [key]: value } : p));

  const saveProfile = async () => {
    if (!profile) return;
    setSavingProfile(true);
    const res = await fetch("/api/settings/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    if (res.ok) {
      setProfile(await res.json());
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    }
    setSavingProfile(false);
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
      <div className="bg-[#101314] border border-white/[0.08] rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/40">Automatic Discovery</p>
          {auto && (
            <button
              onClick={toggleAuto}
              role="switch"
              aria-checked={auto.enabled}
              className={`relative w-11 h-6 rounded-full transition-colors ${auto.enabled ? "bg-[#66FFAB]" : "bg-white/15"}`}
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
          <span className={`font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded ${auto?.enabled ? "bg-[#66FFAB]/15 text-[#66FFAB] border border-[#66FFAB]/30" : "bg-white/5 text-white/40 border border-white/10"}`}>
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

      {/* Applicant Profile */}
      <div className="bg-[#101314] border border-white/[0.08] rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/40">Applicant Profile</p>
          <button
            onClick={saveProfile}
            disabled={savingProfile || !profile}
            className="px-3 py-1.5 bg-[#BC7CFF] hover:bg-[#CA96FF] disabled:opacity-50 text-black font-mono text-[9px] uppercase tracking-[0.08em] font-bold rounded-lg transition-colors"
          >
            {savingProfile ? "Saving…" : profileSaved ? "Saved ✓" : "Save profile"}
          </button>
        </div>
        <p className="text-sm text-white/50 mb-4">
          Used by the <span className="text-white/70">Apply with autofill</span> helper to one-click copy your details
          into CFP forms and prefill application emails.
        </p>

        {!profile ? (
          <p className="font-mono text-xs text-white/30">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {TEXT_FIELDS.map(({ key, label, ph, full }) => (
                <div key={key} className={full ? "md:col-span-2" : ""}>
                  <label className={labelCls}>{label}</label>
                  <input
                    className={inputCls}
                    value={profile[key] ?? ""}
                    onChange={(e) => setField(key, e.target.value)}
                    placeholder={ph}
                  />
                </div>
              ))}
            </div>
            {TEXTAREA_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className={labelCls}>{label}</label>
                <textarea
                  rows={key === "bioLong" || key === "talkTopics" ? 4 : 2}
                  className={`${inputCls} resize-y`}
                  value={profile[key] ?? ""}
                  onChange={(e) => setField(key, e.target.value)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Work Calendar */}
      <div className="bg-[#101314] border border-white/[0.08] rounded-xl p-5 mb-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/40 mb-1">Work Calendar</p>
        <p className="text-sm text-white/50 mb-4">
          Connect a <span className="text-white/70">read-only</span> Google Calendar ICS feed to see whether you&rsquo;re
          free for an event. In Google Calendar: Settings → your calendar → <em>Secret address in iCal format</em>.
        </p>

        <div className="rounded-lg bg-[#FF8067]/8 border border-[#FF8067]/20 p-3 mb-4">
          <p className="font-mono text-[10px] text-[#FF8067]/90 leading-relaxed">
            ⚠ This URL is a secret — anyone with it can read your whole calendar. It is stored server-side, never shown
            in full, and never committed to the repo. In production, set it as the <code>WORK_CALENDAR_ICS_URL</code>{" "}
            environment variable instead.
          </p>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-white/35">Status:</span>
          {cal?.configured ? (
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-[#66FFAB]/15 text-[#66FFAB] border border-[#66FFAB]/30">
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
              className="px-4 py-2 bg-[#BC7CFF] hover:bg-[#CA96FF] disabled:opacity-50 text-black font-semibold text-sm rounded-lg transition-colors"
            >
              {savingCal ? "…" : cal?.configured ? "Replace" : "Connect"}
            </button>
            {cal?.configured && (
              <button
                onClick={clearCalendar}
                disabled={savingCal}
                className="px-4 py-2 text-sm text-[#FF8067]/70 hover:text-[#FF8067] border border-[#FF8067]/20 hover:border-[#FF8067]/40 rounded-lg transition-colors"
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
