"use client";

import { AUDIENCE_LABELS, AUDIENCE_STYLES } from "@/lib/constants";
import { parseAudienceSignals } from "@/lib/events";

interface Props {
  signals: string | null | undefined;
  className?: string;
  max?: number;
}

/** Renders the audience-signal chips (Developers, Customers, Women in Tech, …). */
export default function AudienceBadges({ signals, className = "", max }: Props) {
  const tags = parseAudienceSignals(signals);
  if (tags.length === 0) return null;
  const shown = max ? tags.slice(0, max) : tags;
  const extra = max && tags.length > max ? tags.length - max : 0;
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {shown.map((t) => (
        <span
          key={t}
          className={`font-mono text-[9px] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded ${
            AUDIENCE_STYLES[t] ?? "bg-white/5 text-white/40 border border-white/10"
          }`}
        >
          {AUDIENCE_LABELS[t] ?? t}
        </span>
      ))}
      {extra > 0 && (
        <span className="font-mono text-[9px] text-white/30">+{extra}</span>
      )}
    </div>
  );
}
