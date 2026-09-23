"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BackLink from "@/components/BackLink";
import {
  EVENT_TYPE_STYLES, STATUS_STYLES, STATUS_ORDER,
  EVENT_TYPES, EVENT_STATUSES, REGIONS, LIKELIHOOD_STYLES,
  ACTION_STYLES, ACTION_LABELS, scoreColor,
  VISIBLE_CATEGORIES, CATEGORY_LABELS, CATEGORY_STYLES,
  AUDIENCE_SIGNALS, AUDIENCE_LABELS,
} from "@/lib/constants";
import { deriveCategory } from "@/lib/events";
import EventAvatar from "@/components/EventAvatar";
import AudienceBadges from "@/components/AudienceBadges";
import ApplyModal from "@/components/ApplyModal";
import { useAvailability, AvailabilityChip } from "@/components/Availability";
import ReadinessCard from "@/components/ReadinessCard";
import { SPEAKING_CHECKLIST, ATTENDING_CHECKLIST, GIG_STAGES, ATTEND_STAGES } from "@/lib/constants";
import { BRAND } from "@/lib/brand";

/* ── Types ── */
interface Partner { id: string; name: string; category: string; }
interface Event {
  id: string; title: string; type: string; status: string;
  startDate: string | null; endDate: string | null; location: string | null;
  isOnline: boolean; region: string | null; coderRelevant: boolean;
  cfpDeadline: string | null; url: string | null; contact: string | null;
  description: string | null; sourceNote: string | null; pitchDraft: string | null;
  followUpAt: string | null; partnerId: string | null;
  partner: { id: string; name: string; category: string } | null;
  isPaid: boolean | null; paidNote: string | null; ticketCost: string | null;
  audienceDescription: string | null; audienceSize: number | null;
  otherSpeakers: string | null; acceptanceLikelihood: string | null;
  acceptanceRationale: string | null; howToApply: string | null;
  industry: string | null; relevancyScore: number | null;
  relevancyRationale: string | null; suggestedAction: string | null;
  attending: boolean; readiness: string | null;
  prepStage: string | null; customTasks: string | null;
  applyUrl: string | null; attendUrl: string | null; socialLinks: string | null;
  isCoderEvent: boolean;
  category: string | null; audienceSignals: string | null;
  createdAt: string; updatedAt: string;
}
interface SocialLinks { linkedin?: string | null; instagram?: string | null; twitter?: string | null; youtube?: string | null; facebook?: string | null; }

/* ── Helpers ── */
const inputCls = "w-full px-3 py-2 bg-coder-control border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-coder-purple focus:ring-1 focus:ring-coder-purple transition-colors";
const labelCls = "block font-mono text-[9px] uppercase tracking-[0.1em] text-white/40 mb-1.5";

function toDateInput(d: string | null) { if (!d) return ""; return new Date(d).toISOString().split("T")[0]; }

function fmt(d: string | null, weekday = false) {
  if (!d) return null;
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  if (weekday) opts.weekday = "short";
  return new Date(d).toLocaleDateString("en-GB", opts);
}

function parseSocialLinks(raw: string | null): SocialLinks {
  try { return JSON.parse(raw ?? "{}") as SocialLinks; } catch { return {}; }
}

/** Human-readable format + timing line: "Webinar · Online · 14:00–15:00 CET (1h)". */
function formatLine(ev: { type: string; isOnline: boolean; startDate: string | null; endDate: string | null }): string {
  const parts: string[] = [];
  const isWebinarish = ev.type === "WEBINAR" || ev.type === "PODCAST";
  parts.push(isWebinarish ? (ev.type === "PODCAST" ? "Podcast" : "Webinar") : ev.isOnline ? "Online event" : "In-person");
  if (ev.isOnline && !isWebinarish) parts[0] = "Online event";
  else if (!ev.isOnline && !isWebinarish) parts[0] = "In-person";

  if (ev.startDate) {
    const s = new Date(ev.startDate);
    const hasTime = !(s.getUTCHours() === 0 && s.getUTCMinutes() === 0);
    if (hasTime) {
      const t = s.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      if (ev.endDate) {
        const e = new Date(ev.endDate);
        const sameDay = s.toDateString() === e.toDateString();
        const te = e.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        const mins = Math.round((e.getTime() - s.getTime()) / 60000);
        const dur = mins >= 1440 ? `${Math.round(mins / 1440)}d` : mins >= 60 ? `${(mins / 60).toFixed(mins % 60 ? 1 : 0)}h` : `${mins}m`;
        parts.push(sameDay ? `${t}–${te} (${dur})` : `${t} → multi-day`);
      } else {
        parts.push(t);
      }
    }
  }
  return parts.join(" · ");
}

const cfpUrgent = (d: string | null) =>
  d ? new Date(d).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000 : false;

const STEP_STATUSES = ["DISCOVERED","APPROVED","PITCHED","ACCEPTED","SPOKEN"];
function stepStyle(s: string, cur: string) {
  if (cur === "REJECTED") return s === "DISCOVERED" ? "bg-white/5 text-white/40 border border-white/10" : "text-white/20";
  const ci = STATUS_ORDER.indexOf(cur), si = STATUS_ORDER.indexOf(s);
  if (si < ci) return "bg-coder-purple/10 text-coder-purple/60";
  if (si === ci) return "bg-coder-purple text-black font-semibold";
  return "text-white/25";
}

/* ── Social icons ── */
function SocialIcon({ platform }: { platform: string }) {
  switch (platform) {
    case "linkedin": return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z"/>
        <circle cx="4" cy="4" r="2"/>
      </svg>
    );
    case "instagram": return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="2" y="2" width="20" height="20" rx="5"/>
        <circle cx="12" cy="12" r="4.5"/>
        <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none"/>
      </svg>
    );
    case "twitter": return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    );
    case "youtube": return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.54C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/>
        <polygon points="9.75,15.02 15.5,12 9.75,8.98" fill="#000"/>
      </svg>
    );
    case "facebook": return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
      </svg>
    );
    default: return null;
  }
}

const SOCIAL_COLORS: Record<string, string> = {
  linkedin: "#0077B5", instagram: "#E1306C", twitter: "#ffffff",
  youtube: "#FF0000", facebook: "#1877F2",
};

/* ── Fact row ── */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="font-mono text-[9px] uppercase tracking-[0.09em] text-white/35 w-28 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-white/80 flex-1">{children}</span>
    </div>
  );
}

/* ── Page component ── */
export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [event,    setEvent]    = useState<Event | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [genPitch, setGenPitch] = useState(false);
  const [isAdmin,  setIsAdmin]  = useState(false);
  const [edited,   setEdited]   = useState(false);
  const [copied,   setCopied]   = useState(false);
  const [showEdit, setShowEdit] = useState(false);   // collapsible edit form
  const [form,     setForm]     = useState<Partial<Event>>({});
  const [showApply, setShowApply] = useState(false);
  const { availability } = useAvailability(event ? [event] : [], isAdmin);

  useEffect(() => {
    const load = async () => {
      const [evRes, pRes, adminRes] = await Promise.all([
        fetch(`/api/events/${id}`), fetch("/api/partners"), fetch("/api/auth/me"),
      ]);
      if (!evRes.ok) { router.push("/"); return; }
      const ev = (await evRes.json()) as Event;
      const ps = (await pRes.json()) as Partner[];
      setEvent(ev); setForm(ev);
      setPartners(Array.isArray(ps) ? ps : []);
      setIsAdmin(((await adminRes.json()) as { role?: string })?.role === "ADMIN");
      setLoading(false);
    };
    load();
  }, [id, router]);

  const set = (key: keyof Event, value: unknown) => { setForm((p) => ({ ...p, [key]: value })); setEdited(true); };

  const save = async () => {
    setSaving(true);
    const res = await fetch(`/api/events/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (res.ok) { const u = (await res.json()) as Event; setEvent(u); setForm(u); setEdited(false); }
    setSaving(false);
  };

  const generatePitch = async () => {
    setGenPitch(true);
    const res = await fetch(`/api/events/${id}/pitch`, { method: "POST" });
    if (res.ok) {
      const d = (await res.json()) as { pitchDraft: string };
      setEvent((p) => p ? { ...p, pitchDraft: d.pitchDraft } : p);
      setForm((p) => ({ ...p, pitchDraft: d.pitchDraft }));
    } else {
      const e = (await res.json()) as { error?: string };
      alert(`Generation failed: ${e.error ?? "Unknown"}`);
    }
    setGenPitch(false);
  };

  const deleteEvent = async () => {
    if (!confirm("Delete this event?")) return;
    await fetch(`/api/events/${id}`, { method: "DELETE" });
    router.push("/");
  };

  const copyPitch = () => {
    if (event?.pitchDraft) { navigator.clipboard.writeText(event.pitchDraft); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  const mailtoLink = () => {
    if (!event?.contact?.includes("@")) return null;
    return `mailto:${event.contact}?subject=${encodeURIComponent(`Speaking Application: ${event.title}`)}`;
  };

  if (loading) return <div className="flex items-center justify-center h-60 text-white/30 font-mono text-sm">Loading…</div>;
  if (!event) return null;

  const lh = (form.acceptanceLikelihood ?? event.acceptanceLikelihood) ?? null;
  const sa = (form.suggestedAction      ?? event.suggestedAction)      ?? null;
  const rs = (form.relevancyScore       ?? event.relevancyScore)       ?? null;
  const socialLinks = parseSocialLinks(event.socialLinks);
  const hasSocials  = Object.values(socialLinks).some(Boolean);
  const urgentCfp   = cfpUrgent(event.cfpDeadline);
  const isSpeakingGig = ["ACCEPTED", "SPOKEN"].includes(event.status);
  const category = deriveCategory(event);
  const avail = availability[event.id];
  const toggleSignal = (tag: string) => {
    const current = new Set(
      (form.audienceSignals ?? event.audienceSignals)
        ? (() => { try { return JSON.parse((form.audienceSignals ?? event.audienceSignals) as string) as string[]; } catch { return []; } })()
        : []
    );
    if (current.has(tag)) current.delete(tag); else current.add(tag);
    set("audienceSignals", JSON.stringify([...current]));
  };
  const selectedSignals = (() => {
    try { return JSON.parse((form.audienceSignals ?? event.audienceSignals ?? "[]") as string) as string[]; }
    catch { return []; }
  })();

  return (
    <div className="max-w-4xl mx-auto">

      {/* ══════════════ EVENT BRIEF ══════════════ */}
      <div className="bg-coder-panel border border-white/[0.08] rounded-2xl p-5 mb-5">

        {/* Back + Delete */}
        <div className="flex items-center justify-between mb-4">
          <BackLink />
          {isAdmin && (
            <button onClick={deleteEvent} className="font-mono text-[9px] uppercase tracking-[0.08em] text-coder-coral/50 hover:text-coder-coral transition-colors">Delete</button>
          )}
        </div>

        {/* Header: avatar + title + chips */}
        <div className="flex items-start gap-4 mb-5">
          <div className="flex-shrink-0"><EventAvatar event={event} size={56} /></div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-white leading-tight break-words">{event.title}</h1>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className={`font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded ${CATEGORY_STYLES[category]}`}>{CATEGORY_LABELS[category]}</span>
              <span className={`font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded ${EVENT_TYPE_STYLES[event.type]}`}>{event.type}</span>
              <span className={`font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded ${STATUS_STYLES[event.status]}`}>{event.status}</span>
              {isAdmin && <AvailabilityChip result={avail} />}
              {sa && ACTION_STYLES[sa] && (
                <span className={`font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded ${ACTION_STYLES[sa]}`}>{ACTION_LABELS[sa] ?? sa}</span>
              )}
              {rs != null && (
                <span className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded ${scoreColor(rs)}`} title={event.relevancyRationale ?? ""}>{rs}/100</span>
              )}
            {event.partner?.category === "Tech Alliance" && <span className="font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-coder-amber/15 text-coder-amber border border-coder-amber/30">Tech Alliance</span>}
              {lh && LIKELIHOOD_STYLES[lh] && <span className={`font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded ${LIKELIHOOD_STYLES[lh]}`}>{lh} likelihood</span>}
            </div>
          </div>
        </div>

        {/* Facts grid */}
        <div className="mb-5">
          {event.startDate && (
            <Fact label="Date">
              {fmt(event.startDate, true)}
              {event.endDate && event.endDate !== event.startDate ? ` – ${fmt(event.endDate, true)}` : ""}
            </Fact>
          )}
          {event.location && <Fact label="Location">{event.location}</Fact>}
          {event.region && <Fact label="Region">{event.region}</Fact>}
          <Fact label="Format">{formatLine(event)}</Fact>
          {isAdmin && avail && avail.status !== "unknown" && (
            <Fact label="My availability">
              {avail.status === "free" ? (
                <span className="text-coder-green">Free — no calendar conflicts</span>
              ) : (
                <span className="text-coder-coral">
                  Conflicts: {avail.conflicts.map((c) => c.summary).join(", ")}
                </span>
              )}
            </Fact>
          )}
          {event.industry && <Fact label="Industry">{event.industry}</Fact>}
          {event.cfpDeadline && (
            <Fact label="CFP deadline">
              <span className={urgentCfp ? "text-coder-coral font-semibold" : ""}>
                {fmt(event.cfpDeadline)}{urgentCfp ? " — soon!" : ""}
              </span>
            </Fact>
          )}
          {(event.audienceDescription || event.audienceSize != null) && (
            <Fact label="Audience">
              {event.audienceSize != null && <>{event.audienceSize.toLocaleString()} people{event.audienceDescription ? " · " : ""}</>}
              {event.audienceDescription}
            </Fact>
          )}
          {event.otherSpeakers && <Fact label="Speakers">{event.otherSpeakers}</Fact>}
          {selectedSignals.length > 0 && (
            <Fact label="Audience signals"><AudienceBadges signals={event.audienceSignals} /></Fact>
          )}
          {event.isPaid != null && (
            <Fact label="Paid">
              {event.isPaid ? `Yes${event.paidNote ? ` — ${event.paidNote}` : ""}` : `No${event.paidNote ? ` — ${event.paidNote}` : ""}`}
            </Fact>
          )}
          {event.ticketCost && <Fact label="Ticket cost">{event.ticketCost}</Fact>}
          {event.partner && (
            <Fact label="Partner">
              <Link href="/partners" className="text-coder-purple hover:underline">{event.partner.name}</Link>
              <span className="text-white/40"> · {event.partner.category}</span>
            </Fact>
          )}
          {event.contact && <Fact label="Contact">{event.contact}</Fact>}
          {event.followUpAt && <Fact label="Follow-up">{fmt(event.followUpAt)}</Fact>}
          {event.sourceNote && <Fact label="Source">{event.sourceNote}</Fact>}
        </div>

        {/* Links row */}
        {(event.url || event.applyUrl || event.attendUrl || hasSocials) && (
          <div className="flex flex-wrap items-center gap-2 mb-5">
            {event.url && (
              <a href={event.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 border border-white/15 text-white/70 hover:text-white hover:border-white/30 font-mono text-[10px] uppercase tracking-[0.08em] rounded-lg transition-all">
                Event page
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M2 8L8 2M5 2h3v3"/></svg>
              </a>
            )}
            {event.applyUrl && (
              <a href={event.applyUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-coder-purple hover:bg-coder-purple-hover text-black font-semibold font-mono text-[10px] uppercase tracking-[0.08em] rounded-lg transition-colors">
                Apply to speak
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 8L8 2M5 2h3v3"/></svg>
              </a>
            )}
            {event.attendUrl && (
              <a href={event.attendUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-coder-green hover:bg-coder-green-hover text-black font-semibold font-mono text-[10px] uppercase tracking-[0.08em] rounded-lg transition-colors">
                Register / attend
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 8L8 2M5 2h3v3"/></svg>
              </a>
            )}
            {/* Social icon buttons */}
            {hasSocials && (
              <div className="flex items-center gap-1.5">
                {(["linkedin","instagram","twitter","youtube","facebook"] as const).map((p) => {
                  const link = socialLinks[p];
                  if (!link) return null;
                  return (
                    <a key={p} href={link} target="_blank" rel="noopener noreferrer"
                      title={`${p.charAt(0).toUpperCase() + p.slice(1)}`}
                      className="flex items-center justify-center w-8 h-8 rounded-lg border border-white/10 hover:border-white/25 transition-all"
                      style={{ color: SOCIAL_COLORS[p] ?? "white" }}>
                      <SocialIcon platform={p} />
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Apply helper (admin) */}
        {/* Every signed-in speaker: autofill reads THEIR profile and writes
            nothing shared. It was admin-gated from when the owner was the only
            speaker. */}
        {(
          <div className="mb-5">
            <button
              onClick={() => setShowApply(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-coder-purple hover:bg-coder-purple-hover text-black font-semibold font-mono text-[10px] uppercase tracking-[0.08em] rounded-lg transition-colors"
            >
              Apply with autofill
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 8L8 2M5 2h3v3"/></svg>
            </button>
            <span className="ml-2 font-mono text-[9px] text-white/25">Opens the CFP and lets you one-click copy your profile fields</span>
          </div>
        )}

        {/* Description + rationale */}
        {event.description && (
          <p className="text-sm text-white/70 leading-relaxed mb-2">{event.description}</p>
        )}
        {event.relevancyRationale && (
          <p className="font-mono text-[9px] text-white/30 italic leading-relaxed">{event.relevancyRationale}</p>
        )}
      </div>

      {/* ══════════════ ATTENDING TOGGLE ══════════════ */}
      {/* `attending` is per-speaker — it lives on the viewer's own
          EventOpportunity, and PUT /api/events/[id] already accepts it from any
          session. Only the UI was blocking it. */}
      {(
        <div className="mb-5 flex items-center gap-3">
          <button
            onClick={async () => {
              const next = !event.attending;
              setEvent((p) => p ? { ...p, attending: next } : p);
              setForm((p) => ({ ...p, attending: next }));
              await fetch(`/api/events/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attending: next }) });
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border font-mono text-[9px] uppercase tracking-[0.08em] transition-all ${
              event.attending ? "bg-coder-cyan/15 text-coder-cyan border-coder-cyan/30 hover:bg-coder-cyan/25" : "bg-white/5 text-white/40 border-white/10 hover:text-white/70 hover:border-white/20"
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            {event.attending ? "✓ Marked as attending" : "Mark as attending"}
          </button>
          <span className="font-mono text-[9px] text-white/25">
            {event.attending ? "Appears in Podium" : "Toggle to track in Podium"}
          </span>
        </div>
      )}

      {/* ══════════════ READINESS CHECKLIST ══════════════ */}
      {(isSpeakingGig || event.attending) && (
        <div className="mb-5">
          <p className={`${labelCls} mb-3`}>
            {isSpeakingGig ? "Speaking gig readiness" : "Attending readiness"}
          </p>
          <ReadinessCard
            event={event}
            checklist={isSpeakingGig ? SPEAKING_CHECKLIST : ATTENDING_CHECKLIST}
            stages={isSpeakingGig ? GIG_STAGES : ATTEND_STAGES}
            accent={isSpeakingGig ? BRAND.purple : BRAND.cyan}
            canEdit
            onReadinessChange={(_, next) => setEvent((p) => p ? { ...p, readiness: JSON.stringify(next) } : p)}
            onPrepStageChange={(_, stage) => setEvent((p) => p ? { ...p, prepStage: stage } : p)}
            onCustomTasksChange={(_, tasks) => setEvent((p) => p ? { ...p, customTasks: JSON.stringify(tasks) } : p)}
          />
        </div>
      )}

      {/* ══════════════ SUGGESTED APPLICATION ══════════════ */}
      {/* pitchDraft is per-speaker, and the generate route writes only the
          caller's own row. A speaker who cannot draft their own application
          cannot use the product. */}
      {(
        <div className="bg-coder-panel border border-white/[0.08] rounded-xl p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/40">Suggested Application</p>
              <p className="font-mono text-[9px] text-white/20 mt-0.5">AI-drafted text to use or adapt when applying</p>
            </div>
            <div className="flex gap-2">
              {event.pitchDraft && (
                <>
                  <button onClick={copyPitch} className="font-mono text-[9px] uppercase tracking-[0.08em] px-3 py-1.5 border border-white/10 text-white/50 hover:text-white hover:border-white/20 rounded-lg transition-colors">
                    {copied ? "Copied!" : "Copy"}
                  </button>
                  {mailtoLink() && (
                    <a href={mailtoLink()!} className="font-mono text-[9px] uppercase tracking-[0.08em] px-3 py-1.5 bg-coder-purple/15 text-coder-purple border border-coder-purple/25 hover:bg-coder-purple/25 rounded-lg transition-colors">
                      Open in Mail
                    </a>
                  )}
                </>
              )}
              <button onClick={generatePitch} disabled={genPitch}
                className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.08em] px-3 py-1.5 bg-coder-purple hover:bg-coder-purple-hover disabled:opacity-50 text-black font-bold rounded-lg transition-colors">
                {genPitch ? <><span className="animate-spin w-3 h-3 border border-black/25 border-t-black rounded-full inline-block" />Generating…</> : (event.pitchDraft ? "Regenerate" : "Generate")}
              </button>
            </div>
          </div>
          {event.pitchDraft ? (
            <textarea rows={10} className="w-full px-3 py-2.5 bg-coder-control border border-white/10 rounded-lg text-sm text-white/80 font-mono focus:outline-none focus:border-coder-purple focus:ring-1 focus:ring-coder-purple resize-y transition-colors"
              value={form.pitchDraft ?? event.pitchDraft}
              onChange={(e) => { set("pitchDraft", e.target.value); setEdited(true); }} />
          ) : (
            <p className="text-sm text-white/25 italic">No suggested application yet. Click &ldquo;Generate&rdquo; to draft one using Claude.</p>
          )}
        </div>
      )}

      {/* ══════════════ EDIT FORM (ADMIN, COLLAPSIBLE) ══════════════ */}
      {isAdmin && (
        <div className="mb-5">
          <button
            onClick={() => setShowEdit(!showEdit)}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/8 border border-white/10 hover:border-white/20 rounded-lg font-mono text-[10px] uppercase tracking-[0.08em] text-white/50 hover:text-white/80 transition-all w-full justify-between"
          >
            <span>{showEdit ? "Close editor" : "Edit event details"}</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={`transition-transform ${showEdit ? "rotate-180" : ""}`}>
              <path d="M2 4l4 4 4-4"/>
            </svg>
          </button>

          {showEdit && (
            <div className="mt-3 bg-coder-panel border border-white/[0.08] rounded-xl p-5 space-y-5">
              {/* Status stepper */}
              <div>
                <p className={labelCls}>Status pipeline</p>
                <div className="flex items-center gap-1 overflow-x-auto pb-1 flex-wrap">
                  {STEP_STATUSES.map((s, i) => (
                    <div key={s} className="flex items-center flex-shrink-0">
                      <button onClick={() => set("status", s)} className={`font-mono text-[9px] uppercase tracking-[0.08em] px-3 py-1.5 rounded-lg transition-colors ${stepStyle(s, form.status ?? event.status)}`}>{s}</button>
                      {i < STEP_STATUSES.length - 1 && <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="text-white/15 mx-0.5"><path d="M4 2l4 4-4 4"/></svg>}
                    </div>
                  ))}
                  <span className="text-white/10 mx-1 font-mono text-xs">|</span>
                  <button onClick={() => set("status", "REJECTED")} className={`font-mono text-[9px] uppercase tracking-[0.08em] px-3 py-1.5 rounded-lg transition-colors ${(form.status ?? event.status) === "REJECTED" ? "bg-coder-coral text-black font-semibold" : "text-coder-coral/50 hover:text-coder-coral hover:bg-coder-coral/10"}`}>Rejected</button>
                </div>
                {edited && <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-coder-coral/70 mt-1">Unsaved — click Save</p>}
              </div>

              {/* Core fields grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: "Title",        key: "title",      type: "text", ph: "" },
                  { label: "Start Date",   key: "startDate",  type: "date", ph: "" },
                  { label: "End Date",     key: "endDate",    type: "date", ph: "" },
                  { label: "CFP Deadline", key: "cfpDeadline",type: "date", ph: "" },
                  { label: "Follow-up",    key: "followUpAt", type: "date", ph: "" },
                ].map(({ label, key, type, ph }) => (
                  <div key={key}>
                    <label className={labelCls}>{label}</label>
                    <input type={type} className={inputCls}
                      value={type === "date" ? toDateInput(form[key as keyof Event] as string | null) : (form[key as keyof Event] as string ?? "")}
                      onChange={(e) => set(key as keyof Event, type === "date" ? (e.target.value || null) : e.target.value)}
                      placeholder={ph} />
                  </div>
                ))}
                {[
                  { label: "Type",   key: "type",   opts: EVENT_TYPES   },
                  { label: "Status", key: "status", opts: EVENT_STATUSES },
                ].map(({ label, key, opts }) => (
                  <div key={key}>
                    <label className={labelCls}>{label}</label>
                    <select className={inputCls} value={form[key as keyof Event] as string ?? ""} onChange={(e) => set(key as keyof Event, e.target.value)}>
                      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
                {[
                  { label: "Location", key: "location", ph: "City, Country" },
                  { label: "URL",      key: "url",      ph: "https://…"    },
                  { label: "Apply URL",key: "applyUrl", ph: "Direct speaker / CFP application URL" },
                  { label: "Attend URL",key: "attendUrl", ph: "Direct registration / ticket URL" },
                  { label: "Contact",  key: "contact",  ph: "email or name" },
                ].map(({ label, key, ph }) => (
                  <div key={key}>
                    <label className={labelCls}>{label}</label>
                    <input className={inputCls} value={(form[key as keyof Event] as string) ?? ""} onChange={(e) => set(key as keyof Event, e.target.value || null)} placeholder={ph} />
                  </div>
                ))}
                <div>
                  <label className={labelCls}>Region</label>
                  <select className={inputCls} value={form.region ?? ""} onChange={(e) => set("region", e.target.value || null)}>
                    <option value="">—</option>
                    {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Partner</label>
                  <select className={inputCls} value={form.partnerId ?? ""} onChange={(e) => set("partnerId", e.target.value || null)}>
                    <option value="">None</option>
                    {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-5 items-center pt-1 md:col-span-2">
                  {[{ key: "isOnline", label: "Online" }].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={(form[key as keyof Event] as boolean) ?? false} onChange={(e) => set(key as keyof Event, e.target.checked)} className="w-4 h-4 rounded accent-coder-purple" />
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-white/50">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className={labelCls}>Description</label>
                <textarea rows={3} className={`${inputCls} resize-none`} value={form.description ?? ""} onChange={(e) => set("description", e.target.value || null)} />
              </div>

              {/* Social links (JSON) */}
              <div>
                <label className={labelCls}>Social links (JSON)</label>
                <textarea rows={3} className={`${inputCls} font-mono text-[11px] resize-none`}
                  value={form.socialLinks ?? ""}
                  onChange={(e) => set("socialLinks", e.target.value || null)}
                  placeholder={'{"linkedin": "...", "instagram": "...", "twitter": "...", "youtube": "...", "facebook": "..."}'} />
              </div>

              {/* Intelligence fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Industry / vertical</label>
                  <input className={inputCls} value={form.industry ?? ""} onChange={(e) => set("industry", e.target.value || null)} placeholder="e.g. startups/entrepreneurship" />
                </div>
                <div>
                  <label className={labelCls}>Track</label>
                  <select className={inputCls} value={form.category ?? ""} onChange={(e) => set("category", e.target.value || null)}>
                    <option value="">Auto ({CATEGORY_LABELS[deriveCategory(event)]})</option>
                    {VISIBLE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Suggested action</label>
                  <select className={inputCls} value={form.suggestedAction ?? ""} onChange={(e) => set("suggestedAction", e.target.value || null)}>
                    <option value="">Unknown</option>
                    <option value="APPLY_TO_SPEAK">Apply to speak</option>
                    <option value="ATTEND">Attend only</option>
                    <option value="BOTH">Attend + Apply</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Relevancy score (0-100)</label>
                  <input type="number" min={0} max={100} className={inputCls} value={form.relevancyScore ?? ""} onChange={(e) => set("relevancyScore", e.target.value ? Number(e.target.value) : null)} placeholder="0–100" />
                </div>
                <div>
                  <label className={labelCls}>Relevancy rationale</label>
                  <input className={inputCls} value={form.relevancyRationale ?? ""} onChange={(e) => set("relevancyRationale", e.target.value || null)} placeholder="Why this score?" />
                </div>
                <div>
                  <label className={labelCls}>Speaking fee</label>
                  <select className={inputCls} value={form.isPaid == null ? "" : form.isPaid ? "true" : "false"} onChange={(e) => set("isPaid", e.target.value === "" ? null : e.target.value === "true")}>
                    <option value="">Unknown</option>
                    <option value="true">Paid</option>
                    <option value="false">Unpaid</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Fee / travel note</label>
                  <input className={inputCls} value={form.paidNote ?? ""} onChange={(e) => set("paidNote", e.target.value || null)} placeholder="e.g. €500 honorarium" />
                </div>
                <div>
                  <label className={labelCls}>Ticket cost (to attend)</label>
                  <input className={inputCls} value={form.ticketCost ?? ""} onChange={(e) => set("ticketCost", e.target.value || null)} placeholder="e.g. Free, ~€1,995, From €99" />
                </div>
                <div>
                  <label className={labelCls}>Audience description</label>
                  <input className={inputCls} value={form.audienceDescription ?? ""} onChange={(e) => set("audienceDescription", e.target.value || null)} placeholder="e.g. startup founders" />
                </div>
                <div>
                  <label className={labelCls}>Audience size (est.)</label>
                  <input type="number" min={0} className={inputCls} value={form.audienceSize ?? ""} onChange={(e) => set("audienceSize", e.target.value ? Number(e.target.value) : null)} placeholder="e.g. 300" />
                </div>
                <div className="md:col-span-2">
                  <label className={labelCls}>Other / past speakers</label>
                  <input className={inputCls} value={form.otherSpeakers ?? ""} onChange={(e) => set("otherSpeakers", e.target.value || null)} placeholder="e.g. Andrej Karpathy (past)" />
                </div>
                <div className="md:col-span-2">
                  <label className={labelCls}>How to apply</label>
                  <input className={inputCls} value={form.howToApply ?? ""} onChange={(e) => set("howToApply", e.target.value || null)} placeholder="CFP URL, email, LinkedIn DM…" />
                </div>
                <div>
                  <label className={labelCls}>Acceptance likelihood</label>
                  <select className={inputCls} value={form.acceptanceLikelihood ?? ""} onChange={(e) => set("acceptanceLikelihood", e.target.value || null)}>
                    <option value="">Unknown</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Likelihood rationale</label>
                  <input className={inputCls} value={form.acceptanceRationale ?? ""} onChange={(e) => set("acceptanceRationale", e.target.value || null)} placeholder="One sentence explanation" />
                </div>
              </div>

              {/* Audience signals */}
              <div>
                <label className={labelCls}>Audience signals</label>
                <div className="flex flex-wrap gap-1.5">
                  {AUDIENCE_SIGNALS.map((tag) => {
                    const on = selectedSignals.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleSignal(tag)}
                        className={`font-mono text-[10px] uppercase tracking-[0.06em] px-2.5 py-1 rounded-lg border transition-colors ${
                          on
                            ? "bg-coder-purple/20 text-coder-purple border-coder-purple/40"
                            : "bg-white/5 text-white/40 border-white/10 hover:text-white/70 hover:border-white/20"
                        }`}
                      >
                        {on ? "✓ " : ""}{AUDIENCE_LABELS[tag]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
                <button onClick={() => { setForm(event); setEdited(false); setShowEdit(false); }} className="px-4 py-2 text-sm text-white/40 hover:text-white border border-white/10 hover:border-white/20 rounded-lg transition-colors">Cancel</button>
                <button onClick={save} disabled={saving || !edited} className="px-6 py-2 bg-coder-purple hover:bg-coder-purple-hover disabled:opacity-50 text-black font-semibold text-sm rounded-lg transition-colors">
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Metadata */}
      <div className="flex gap-4 font-mono text-[9px] uppercase tracking-[0.08em] text-white/20">
        <span>Created: {fmt(event.createdAt)}</span>
        <span>Updated: {fmt(event.updatedAt)}</span>
      </div>

      {showApply && (
        <ApplyModal event={event} onClose={() => setShowApply(false)} />
      )}
    </div>
  );
}
