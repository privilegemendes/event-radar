import "server-only";

/**
 * Tiny dependency-free iCalendar (ICS) parser + free/busy helper.
 * Handles the subset Google Calendar's private ICS feed emits: VEVENT blocks
 * with DTSTART/DTEND (date or date-time, with or without TZID), SUMMARY,
 * line folding, and TRANSP (free events are ignored for busy checks).
 */

export interface BusyInterval {
  start: number; // epoch ms
  end: number; // epoch ms
  summary: string;
  allDay: boolean;
}

function unfold(ics: string): string[] {
  // RFC 5545 line folding: continuation lines begin with a space or tab.
  const rawLines = ics.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

/** Parse an ICS date/datetime value into epoch ms. Returns [ms, allDay]. */
function parseIcsDate(value: string, params: Record<string, string>): [number, boolean] | null {
  const v = value.trim();
  // All-day: VALUE=DATE, format YYYYMMDD
  if (params.VALUE === "DATE" || /^\d{8}$/.test(v)) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
    if (!m) return null;
    return [Date.UTC(+m[1], +m[2] - 1, +m[3]), true];
  }
  // UTC: YYYYMMDDTHHMMSSZ
  let m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(v);
  if (m) {
    return [Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]), false];
  }
  // Floating / TZID local time: YYYYMMDDTHHMMSS — best-effort treat as UTC.
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(v);
  if (m) {
    return [Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]), false];
  }
  return null;
}

export function parseIcsBusy(ics: string): BusyInterval[] {
  const lines = unfold(ics);
  const out: BusyInterval[] = [];
  let inEvent = false;
  let start: [number, boolean] | null = null;
  let end: [number, boolean] | null = null;
  let summary = "";
  let transparent = false;
  let cancelled = false;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      start = end = null;
      summary = "";
      transparent = false;
      cancelled = false;
      continue;
    }
    if (line === "END:VEVENT") {
      if (inEvent && start && !transparent && !cancelled) {
        const s = start[0];
        const e = end ? end[0] : (start[1] ? s + 24 * 3600 * 1000 : s + 3600 * 1000);
        out.push({ start: s, end: e, summary: summary || "(busy)", allDay: start[1] });
      }
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;

    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const left = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [name, ...paramParts] = left.split(";");
    const params: Record<string, string> = {};
    for (const p of paramParts) {
      const eq = p.indexOf("=");
      if (eq !== -1) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
    }

    switch (name.toUpperCase()) {
      case "DTSTART":
        start = parseIcsDate(value, params);
        break;
      case "DTEND":
        end = parseIcsDate(value, params);
        break;
      case "SUMMARY":
        summary = value.replace(/\\,/g, ",").replace(/\\n/gi, " ").replace(/\\;/g, ";").trim();
        break;
      case "TRANSP":
        transparent = value.trim().toUpperCase() === "TRANSPARENT";
        break;
      case "STATUS":
        cancelled = value.trim().toUpperCase() === "CANCELLED";
        break;
    }
  }
  return out;
}

export interface Conflict {
  summary: string;
  start: number;
  end: number;
}

export interface AvailabilityResult {
  status: "free" | "busy" | "unknown";
  conflicts: Conflict[];
}

/** Does [aStart,aEnd) overlap [bStart,bEnd)? */
function overlaps(aS: number, aE: number, bS: number, bE: number): boolean {
  return aS < bE && bS < aE;
}

/**
 * Check availability for an event window against the busy intervals.
 * If the event has no end, assume a 2h window from start.
 */
export function checkAvailability(
  busy: BusyInterval[],
  eventStart: number | null,
  eventEnd: number | null,
): AvailabilityResult {
  if (eventStart == null) return { status: "unknown", conflicts: [] };
  const end = eventEnd ?? eventStart + 2 * 3600 * 1000;
  const conflicts: Conflict[] = [];
  for (const b of busy) {
    if (b.allDay) continue; // all-day markers rarely mean "unavailable"
    if (overlaps(eventStart, end, b.start, b.end)) {
      conflicts.push({ summary: b.summary, start: b.start, end: b.end });
    }
  }
  return { status: conflicts.length ? "busy" : "free", conflicts };
}
