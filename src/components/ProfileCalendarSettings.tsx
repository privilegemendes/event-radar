"use client";

import { useEffect, useState } from "react";
import { SPEAKING_LEVELS, SPEAKING_LEVEL_LABELS, type ApplicantProfile, type SpeakingLevel } from "@/lib/profile-schema";

const inputCls =
  "w-full px-3 py-2.5 bg-coder-control border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-coder-purple focus:ring-1 focus:ring-coder-purple transition-colors";
const labelCls = "block font-mono text-[9px] uppercase tracking-[0.1em] text-white/40 mb-1.5";

const TEXT_FIELDS: { key: keyof ApplicantProfile; label: string; ph?: string; full?: boolean }[] = [
  { key: "fullName", label: "Full name", ph: "Ada Lovelace" },
  { key: "pronouns", label: "Pronouns", ph: "she/her" },
  { key: "jobTitle", label: "Job title", ph: "EMEA Partner Manager" },
  { key: "company", label: "Company", ph: "Coder" },
  { key: "email", label: "Email", ph: "you@example.com" },
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

/* Speaker-brief fields. Unlike the applicant fields above these are fed to the
   LLM, so the hints describe what each one changes about discovery output. */
const BRIEF_FIELDS: { key: keyof ApplicantProfile; label: string; hint: string; rows?: number }[] = [
  { key: "signatureTopics", label: "Signature topics", hint: "One per line. Searched for, and scored against." },
  { key: "homeGeographies", label: "Priority locations", hint: "One per line, e.g. \"Amsterdam, NL\". Discovery searches each separately." },
  { key: "credentials",     label: "Speaking credentials", hint: "One per line. Cited in generated pitches." },
  { key: "employerAngle",   label: "Employer angle", hint: "How your employer is positioned in pitches. Leave blank if you speak independently — the Participate track and employer pitches switch off.", rows: 3 },
  { key: "excludedDomains", label: "Excluded event types", hint: "One per line. Dropped from discovery entirely. Blank means nothing is excluded." },
  { key: "privateKeywords", label: "Private-event keywords", hint: "One per line. Matching events are visible only to the owner." },
  { key: "rubricOverride",  label: "Scoring rubric override", hint: "Advanced: replaces the generated rubric wholesale. Leave blank to use the one generated from your speaking level.", rows: 4 },
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

      {/* Applicant Profile */}
      <div className="bg-coder-panel border border-white/[0.08] rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/40">Applicant Profile</p>
          <button
            onClick={saveProfile}
            disabled={savingProfile || !profile}
            className="px-3 py-1.5 bg-coder-purple hover:bg-coder-purple-hover disabled:opacity-50 text-black font-mono text-[9px] uppercase tracking-[0.08em] font-bold rounded-lg transition-colors"
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

      {/* Speaker Brief — drives discovery, scoring and pitches */}
      <div className="bg-coder-panel border border-white/[0.08] rounded-xl p-5 mb-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/40 mb-1">Speaker Brief</p>
        <p className="text-sm text-white/50 mb-4">
          Steers AI discovery, scoring and pitch drafting. Changes apply to the next discovery run.
        </p>

        {!profile ? (
          <p className="font-mono text-xs text-white/30">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Speaking level</label>
              <select
                className={inputCls}
                value={profile.speakingLevel || "FIRST_TIME"}
                onChange={(e) => setField("speakingLevel", e.target.value)}
              >
                {SPEAKING_LEVELS.map((lvl: SpeakingLevel) => (
                  <option key={lvl} value={lvl}>{SPEAKING_LEVEL_LABELS[lvl]}</option>
                ))}
              </select>
              <p className="font-mono text-[9px] text-white/25 mt-1.5 leading-relaxed">
                Selects the scoring rubric. A first-timer scores meetups and podcasts highest; a keynote speaker scores them lowest.
              </p>
            </div>

            {BRIEF_FIELDS.map(({ key, label, hint, rows }) => (
              <div key={key}>
                <label className={labelCls}>{label}</label>
                <textarea
                  rows={rows ?? 2}
                  className={`${inputCls} resize-y`}
                  value={profile[key] ?? ""}
                  onChange={(e) => setField(key, e.target.value)}
                />
                <p className="font-mono text-[9px] text-white/25 mt-1.5 leading-relaxed">{hint}</p>
              </div>
            ))}

            {/* Same handler as the applicant card — one PUT saves the whole
                profile — but repeated here so the brief can be saved in place. */}
            <button
              onClick={saveProfile}
              disabled={savingProfile}
              className="px-4 py-2 bg-coder-purple hover:bg-coder-purple-hover disabled:opacity-50 text-black font-semibold text-sm rounded-lg transition-colors"
            >
              {savingProfile ? "Saving…" : profileSaved ? "Saved ✓" : "Save brief"}
            </button>
          </div>
        )}
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
