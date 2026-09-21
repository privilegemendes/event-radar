"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ApplicantProfile } from "@/lib/settings";

interface ApplyEvent {
  id: string;
  title: string;
  applyUrl?: string | null;
  howToApply?: string | null;
  url?: string | null;
  contact?: string | null;
  pitchDraft?: string | null;
}

const FIELD_ORDER: { key: keyof ApplicantProfile; label: string }[] = [
  { key: "fullName", label: "Full name" },
  { key: "pronouns", label: "Pronouns" },
  { key: "jobTitle", label: "Job title" },
  { key: "company", label: "Company" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "location", label: "Location" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "twitter", label: "Twitter / X" },
  { key: "website", label: "Website" },
  { key: "headshotUrl", label: "Headshot URL" },
  { key: "bioShort", label: "Short bio" },
  { key: "bioLong", label: "Long bio" },
  { key: "talkTopics", label: "Talk topics" },
  { key: "dietary", label: "Dietary / access" },
];

function isEmail(s: string | null | undefined): boolean {
  return !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}
function isHttp(s: string | null | undefined): boolean {
  return !!s && /^https?:\/\//i.test(s.trim());
}

export default function ApplyModal({ event, onClose }: { event: ApplyEvent; onClose: () => void }) {
  const [profile, setProfile] = useState<ApplicantProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => setProfile(p))
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, []);

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
    } catch {
      /* ignore */
    }
  };

  const filled = FIELD_ORDER.filter(({ key }) => (profile?.[key] ?? "").trim().length > 0);

  const allText = filled.map(({ key, label }) => `${label}: ${profile![key]}`).join("\n");

  const cfpLink =
    (isHttp(event.applyUrl) && event.applyUrl) ||
    (isHttp(event.howToApply) && event.howToApply) ||
    (isHttp(event.url) && event.url) ||
    null;

  const emailTarget =
    (isEmail(event.contact) && event.contact) ||
    (isEmail(event.howToApply) && event.howToApply) ||
    (isEmail(profile?.email) ? null : null);

  const mailto = (() => {
    if (!emailTarget) return null;
    const subject = `Speaker application — ${event.title}`;
    const bodyLines = [
      event.pitchDraft?.trim() ||
        `Hi,\n\nI'd love to be considered as a speaker for ${event.title}.`,
      "",
      "— My details —",
      allText,
    ];
    return `mailto:${emailTarget}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join("\n"))}`;
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-coder-panel border border-white/10 rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/[0.07]">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-coder-purple">Apply helper</p>
            <h2 className="text-sm font-semibold text-white mt-0.5 leading-snug">{event.title}</h2>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white text-lg leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {cfpLink && (
              <a
                href={cfpLink}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-coder-purple text-black text-xs font-semibold hover:bg-coder-purple-hover transition-colors"
              >
                Open CFP / form ↗
              </a>
            )}
            {mailto && (
              <a
                href={mailto}
                className="px-3 py-1.5 rounded-lg bg-coder-cyan/15 text-coder-cyan border border-coder-cyan/30 text-xs font-semibold hover:bg-coder-cyan/25 transition-colors"
              >
                Draft email ↗
              </a>
            )}
            {filled.length > 0 && (
              <button
                onClick={() => copy("__all", allText)}
                className="px-3 py-1.5 rounded-lg bg-white/5 text-white/70 border border-white/10 text-xs font-medium hover:bg-white/10 transition-colors"
              >
                {copied === "__all" ? "Copied ✓" : "Copy all fields"}
              </button>
            )}
          </div>

          {!cfpLink && (
            <p className="font-mono text-[10px] text-white/30">
              No apply link on this event — add an Apply URL, then open the CFP and paste fields below.
            </p>
          )}

          {/* Profile fields */}
          {loading ? (
            <p className="font-mono text-xs text-white/30">Loading profile…</p>
          ) : filled.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 text-center">
              <p className="text-xs text-white/50">Your Applicant Profile is empty.</p>
              <Link href="/settings" onClick={onClose} className="inline-block mt-2 font-mono text-[10px] uppercase tracking-wider text-coder-purple hover:text-coder-purple-hover">
                Set it up in Settings →
              </Link>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/25">
                Click any field to copy it into the form
              </p>
              {filled.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => copy(label, String(profile![key]))}
                  className="w-full flex items-start gap-3 text-left px-3 py-2 rounded-lg bg-coder-control border border-white/[0.07] hover:border-coder-purple/30 hover:bg-coder-panel-alt transition-colors group"
                >
                  <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-white/35 w-24 flex-shrink-0 pt-0.5">
                    {label}
                  </span>
                  <span className="text-xs text-white/80 flex-1 min-w-0 break-words">{String(profile![key])}</span>
                  <span className="font-mono text-[9px] text-white/25 group-hover:text-coder-purple flex-shrink-0 pt-0.5">
                    {copied === label ? "copied ✓" : "copy"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
