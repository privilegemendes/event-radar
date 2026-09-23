"use client";

import { useState } from "react";
import { BRAND } from "@/lib/brand";

export type AvatarSize = 24 | 32 | 40 | 56;

interface EventAvatarProps {
  event: { title: string; type: string; url?: string | null };
  size?: AvatarSize;
}

/* ── Brand type colors ── */
const TYPE_COLORS: Record<string, string> = {
  CONFERENCE: BRAND.purple,
  MEETUP:     BRAND.green,
  EVENT:      BRAND.coral,
  PODCAST:    BRAND.pink,
  WEBINAR:    BRAND.cyan,
};

const RADIUS: Record<AvatarSize, string> = {
  24: "rounded-lg",
  32: "rounded-lg",
  40: "rounded-xl",
  56: "rounded-xl",
};

function safeHostname(url: string): string | null {
  try { return new URL(url).hostname; } catch { return null; }
}

/* ── Inline SVG icons per type ── */
function TypeIcon({ type, color, size }: { type: string; color: string; size: number }) {
  const sw = Math.max(1.5, size / 9);
  switch (type) {
    case "PODCAST":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="10" r="4" />
          <path d="M12 14v4M8 20h8" />
          <path d="M6 6.5C4.8 8 4 9.9 4 12M18 6.5c1.2 1.5 2 3.4 2 5.5" />
        </svg>
      );
    case "WEBINAR":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="13" rx="2" />
          <path d="M8 21h8M12 17v4" />
          <polygon points="10,8 16,10.5 10,13" fill={color} stroke="none" />
        </svg>
      );
    case "CONFERENCE":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 20h20" />
          <path d="M7 20V8a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v12" />
          <path d="M12 20V5" />
          <path d="M9 5V3h6v2" />
          <path d="M9 12h6M9 15.5h6" />
        </svg>
      );
    case "MEETUP":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8.5" cy="7" r="3" />
          <path d="M2 21c0-3.1 2.7-5.5 6.5-5.5s6.5 2.4 6.5 5.5" />
          <circle cx="17" cy="8" r="2.5" />
          <path d="M22 21c0-2.5-2.2-4.5-5-4.5" />
        </svg>
      );
    case "EVENT":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round">
          <circle cx="12" cy="12" r="5" />
        </svg>
      );
  }
}

/* ── Type-gradient fallback tile ── */
function TypeTile({ type, size }: { type: string; size: AvatarSize }) {
  const color = TYPE_COLORS[type] ?? BRAND.purple;
  const iconSize = Math.round(size * 0.48);
  return (
    <div
      className={`${RADIUS[size]} flex-shrink-0 flex items-center justify-center`}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${color}2a 0%, ${color}10 100%)`,
        border: `1px solid ${color}28`,
      }}
    >
      <TypeIcon type={type} color={color} size={iconSize} />
    </div>
  );
}

/* ── Main component ── */
export default function EventAvatar({ event, size = 40 }: EventAvatarProps) {
  const [failed, setFailed] = useState(false);

  const hostname = event.url ? safeHostname(event.url) : null;
  const faviconUrl = hostname
    ? `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`
    : null;

  if (!faviconUrl || failed) {
    return <TypeTile type={event.type} size={size} />;
  }

  return (
    <div
      className={`${RADIUS[size]} flex-shrink-0 flex items-center justify-center overflow-hidden`}
      style={{
        width: size,
        height: size,
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(255,255,255,0.15)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={faviconUrl}
        alt=""
        width={Math.round(size * 0.6)}
        height={Math.round(size * 0.6)}
        style={{ objectFit: "contain" }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

/* ── Tiny dot-only variant for calendar pills (no favicon, just type color) ── */
export function EventTypeDot({ type, sizePx = 7 }: { type: string; sizePx?: number }) {
  const color = TYPE_COLORS[type] ?? BRAND.purple;
  return (
    <span
      className="rounded-full flex-shrink-0 inline-block"
      style={{ width: sizePx, height: sizePx, background: color }}
    />
  );
}

/* ── Exported for use in empty states ── */
export { TypeIcon, TYPE_COLORS };
