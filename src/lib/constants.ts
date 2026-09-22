/* ── Event type badge styles — Coder brand palette ── */
export const EVENT_TYPE_STYLES: Record<string, string> = {
  CONFERENCE: "bg-coder-purple/15 text-coder-purple border border-coder-purple/30",
  MEETUP:     "bg-coder-green/15 text-coder-green border border-coder-green/30",
  EVENT:      "bg-coder-coral/15 text-coder-coral border border-coder-coral/30",
  PODCAST:    "bg-coder-pink/15 text-coder-pink border border-coder-pink/30",
  WEBINAR:    "bg-coder-cyan/15 text-coder-cyan border border-coder-cyan/30",
};

export const EVENT_TYPE_DOT: Record<string, string> = {
  CONFERENCE: "bg-coder-purple",
  MEETUP:     "bg-coder-green",
  EVENT:      "bg-coder-coral",
  PODCAST:    "bg-coder-pink",
  WEBINAR:    "bg-coder-cyan",
};

/* ── Status badge styles ── */
export const STATUS_STYLES: Record<string, string> = {
  DISCOVERED: "bg-white/5 text-white/50 border border-white/10",
  APPROVED:   "bg-coder-cyan/15 text-coder-cyan border border-coder-cyan/30",
  PITCHED:    "bg-coder-purple/15 text-coder-purple border border-coder-purple/30",
  ACCEPTED:   "bg-coder-green/15 text-coder-green border border-coder-green/30",
  SPOKEN:     "bg-coder-green/10 text-coder-green/70 border border-coder-green/20",
  REJECTED:   "bg-coder-coral/15 text-coder-coral border border-coder-coral/30",
};

export const STATUS_ORDER = [
  "DISCOVERED",
  "APPROVED",
  "PITCHED",
  "ACCEPTED",
  "SPOKEN",
  "REJECTED",
];

export const LIKELIHOOD_STYLES: Record<string, string> = {
  HIGH:   "bg-coder-green/15 text-coder-green border border-coder-green/30",
  MEDIUM: "bg-coder-cyan/15 text-coder-cyan border border-coder-cyan/30",
  LOW:    "bg-coder-coral/15 text-coder-coral border border-coder-coral/30",
};

export const ACTION_STYLES: Record<string, string> = {
  APPLY_TO_SPEAK: "bg-coder-green/15 text-coder-green border border-coder-green/30",
  BOTH:           "bg-coder-cyan/15 text-coder-cyan border border-coder-cyan/30",
  ATTEND:         "bg-white/5 text-white/40 border border-white/10",
};

export function scoreColor(n: number | null): string {
  if (n == null) return "bg-white/5 text-white/30 border border-white/10";
  if (n >= 70)  return "bg-coder-green/15 text-coder-green border border-coder-green/30";
  if (n >= 40)  return "bg-coder-cyan/15 text-coder-cyan border border-coder-cyan/30";
  return               "bg-coder-coral/15 text-coder-coral border border-coder-coral/30";
}

export const ACTION_LABELS: Record<string, string> = {
  APPLY_TO_SPEAK: "Apply to speak",
  BOTH:           "Attend + Apply",
  ATTEND:         "Attend",
};

export const EVENT_TYPES    = ["CONFERENCE", "MEETUP", "EVENT", "PODCAST", "WEBINAR"];
export const EVENT_STATUSES = ["DISCOVERED", "APPROVED", "PITCHED", "ACCEPTED", "SPOKEN", "REJECTED"];
export const REGIONS        = ["North America", "UK", "Europe", "Middle East", "Africa", "Asia Pacific", "Online", "Other"];  // macro regions

export const COST_BUCKETS   = ["Free", "Invite only", "$0–1,000", "$1,000–3,000", "$3,000+", "Unknown"];

/**
 * Bucket an event's attendee cost into a filterable band. Uses ticketCost for the
 * price and ticketCost/howToApply/description for free / invite-only signals.
 */
export function costBucket(ev: { ticketCost?: string | null; howToApply?: string | null; description?: string | null; isPaid?: boolean | null }): string {
  const price = (ev.ticketCost ?? "").toLowerCase();
  const ctx = `${ev.ticketCost ?? ""} ${ev.howToApply ?? ""} ${ev.description ?? ""}`.toLowerCase();
  if (/invite[\s-]?only|invitation only|by invitation|invite-only|rsvp required|apply to attend|application required|approval required/.test(ctx)) return "Invite only";
  if (/\bfree\b|no charge|complimentary|no cost/.test(price)) return "Free";
  const nums = (ev.ticketCost ?? "").replace(/[,\s]/g, "").match(/\d+(?:\.\d+)?/g);
  if (nums && nums.length) {
    const max = Math.max(...nums.map(Number));
    if (max <= 1000) return "$0–1,000";
    if (max <= 3000) return "$1,000–3,000";
    return "$3,000+";
  }
  return "Unknown";
}
export const PARTNER_STAGES = ["Signed", "Close to Sign", "Warm Engagement", "Nurturing", "To Be Outreached", "No engagement", "Alliance"];
export const PARTNER_CATEGORIES = ["GSI", "SI", "Reseller", "Cloud/AWS", "Boutique AI", "Tech Alliance"];

/* ── Partner regions & tiers ── */
export const PARTNER_REGIONS = ["NAMER", "EMEA", "LATAM", "APAC"];
export const PARTNER_TIERS   = ["T1", "T2", "T3"];

export const REGION_LABELS: Record<string, string> = {
  NAMER: "NAMER",
  EMEA:  "EMEA",
  LATAM: "LATAM",
  APAC:  "APAC",
};

export const REGION_STYLES: Record<string, string> = {
  NAMER: "bg-coder-cyan/15 text-coder-cyan border border-coder-cyan/30",
  EMEA:  "bg-coder-purple/15 text-coder-purple border border-coder-purple/30",
  LATAM: "bg-coder-green/15 text-coder-green border border-coder-green/30",
  APAC:  "bg-coder-amber/15 text-coder-amber border border-coder-amber/30",
};

/* ── Top-level tracks ── */
export const CATEGORIES = ["ATTEND", "PARTICIPATE", "SPEAK"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<string, string> = {
  ATTEND:      "Attend",
  PARTICIPATE: "Participate",
  SPEAK:       "Speak",
};

/* Short helper text shown under each track heading */
export const CATEGORY_TAGLINES: Record<string, string> = {
  ATTEND:      "Events I’d go to individually",
  PARTICIPATE: "Coder sponsors or attends as a company",
  SPEAK:       "Speaking opportunities for me",
};

/* How each track is ranked — shown as a hint */
export const CATEGORY_RANK_HINTS: Record<string, string> = {
  ATTEND:      "Ranked by personal relevance",
  PARTICIPATE: "Ranked by strategic value (customers & partners present)",
  SPEAK:       "Ranked by likelihood I get accepted",
};

export const CATEGORY_STYLES: Record<string, string> = {
  ATTEND:      "bg-coder-cyan/15 text-coder-cyan border border-coder-cyan/30",
  PARTICIPATE: "bg-coder-purple/15 text-coder-purple border border-coder-purple/30",
  SPEAK:       "bg-coder-green/15 text-coder-green border border-coder-green/30",
};

export const CATEGORY_ACCENT: Record<string, string> = {
  ATTEND:      "#01F2FF",
  PARTICIPATE: "#BC7CFF",
  SPEAK:       "#66FFAB",
};

/* ── Audience signals ── */
export const AUDIENCE_SIGNALS = [
  "DEVELOPERS", "ENGINEERS", "CUSTOMERS", "ENTREPRENEURS",
  "SMBS", "PROFESSIONALS", "WOMEN_IN_TECH", "PARTNERS",
] as const;
export type AudienceSignal = (typeof AUDIENCE_SIGNALS)[number];

export const AUDIENCE_LABELS: Record<string, string> = {
  DEVELOPERS:    "Developers",
  ENGINEERS:     "Engineers",
  CUSTOMERS:     "Customers",
  ENTREPRENEURS: "Entrepreneurs",
  SMBS:          "SMBs",
  PROFESSIONALS: "Professionals",
  WOMEN_IN_TECH: "Women in Tech",
  PARTNERS:      "Partners",
};

export const AUDIENCE_STYLES: Record<string, string> = {
  DEVELOPERS:    "bg-coder-cyan/10 text-coder-cyan/80 border border-coder-cyan/25",
  ENGINEERS:     "bg-coder-cyan/10 text-coder-cyan/80 border border-coder-cyan/25",
  CUSTOMERS:     "bg-coder-green/10 text-coder-green/80 border border-coder-green/25",
  ENTREPRENEURS: "bg-coder-coral/10 text-coder-coral/80 border border-coder-coral/25",
  SMBS:          "bg-coder-amber/10 text-coder-amber/90 border border-coder-amber/25",
  PROFESSIONALS: "bg-white/5 text-white/50 border border-white/15",
  WOMEN_IN_TECH: "bg-coder-pink/15 text-coder-pink border border-coder-pink/30",
  PARTNERS:      "bg-coder-purple/10 text-coder-purple/80 border border-coder-purple/25",
};

/* ── Readiness checklists ── */
export interface ChecklistItem { key: string; label: string; }

export const SPEAKING_CHECKLIST: ChecklistItem[] = [
  { key: "speech_ready",     label: "Speech written & rehearsed" },
  { key: "slides_ready",     label: "Slides / visuals ready" },
  { key: "social_announced", label: "Announced gig on social media" },
  { key: "travel_booked",    label: "Travel & stay booked" },
  { key: "promo_posted",     label: "Pre-event promo post" },
  { key: "followup_plan",    label: "Post-event follow-up plan" },
];

export const ATTENDING_CHECKLIST: ChecklistItem[] = [
  { key: "ticket_arranged",    label: "Ticket / registration arranged" },
  { key: "travel_booked",      label: "Travel & stay booked" },
  { key: "social_shared",      label: "Shared attendance on social media" },
  { key: "connections_invited",label: "Invited connections to meet up" },
  { key: "meetings_scheduled", label: "Meetings scheduled with contacts" },
  { key: "followup_plan",      label: "Post-event follow-up plan" },
];

export interface StageItem { key: string; label: string; }

export const GIG_STAGES: StageItem[] = [
  { key: "CONFIRMED",   label: "Confirmed"   },
  { key: "PREPARING",   label: "Preparing"   },
  { key: "PROMOTING",   label: "Promoting"   },
  { key: "DELIVERED",   label: "Delivered"   },
  { key: "FOLLOWED_UP", label: "Followed up" },
];

export const ATTEND_STAGES: StageItem[] = [
  { key: "PLANNED",     label: "Planned"     },
  { key: "REGISTERED",  label: "Registered"  },
  { key: "ATTENDED",    label: "Attended"    },
  { key: "FOLLOWED_UP", label: "Followed up" },
];

