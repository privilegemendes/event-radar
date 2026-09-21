"use client";

import { useEffect, useState } from "react";

export interface AvailabilityResult {
  status: "free" | "busy" | "unknown";
  conflicts: { summary: string; start: number; end: number }[];
}

interface EventWindow {
  id: string;
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * Batch-fetches free/busy availability for a set of events from the user's
 * work calendar. Only runs for admins with a configured calendar.
 * Returns a map of eventId -> result, plus whether a calendar is configured.
 */
export function useAvailability(events: EventWindow[], enabled: boolean) {
  const [map, setMap] = useState<Record<string, AvailabilityResult>>({});
  const [configured, setConfigured] = useState(false);

  const key = events
    .filter((e) => e.startDate)
    .map((e) => e.id)
    .sort()
    .join(",");

  useEffect(() => {
    if (!enabled) return;
    const items = events
      .filter((e) => e.startDate)
      .map((e) => ({ id: e.id, start: e.startDate, end: e.endDate ?? null }));
    if (items.length === 0) return;
    let cancelled = false;
    fetch("/api/calendar/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setConfigured(!!data.configured);
        setMap(data.results ?? {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return { availability: map, calendarConfigured: configured };
}

function fmtConflict(c: { summary: string; start: number }): string {
  const d = new Date(c.start).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return `${c.summary} (${d})`;
}

export function AvailabilityChip({ result, compact = false }: { result?: AvailabilityResult; compact?: boolean }) {
  if (!result || result.status === "unknown") return null;
  if (result.status === "free") {
    return (
      <span className="font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-coder-green/15 text-coder-green border border-coder-green/30">
        ✓ Free
      </span>
    );
  }
  const title = result.conflicts.map(fmtConflict).join("\n");
  return (
    <span
      title={title}
      className="font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-coder-coral/15 text-coder-coral border border-coder-coral/30"
    >
      {compact
        ? "⚠ Busy"
        : `⚠ Conflict${result.conflicts.length > 1 ? ` ×${result.conflicts.length}` : ""}`}
    </span>
  );
}
