import { AUDIENCE_SIGNALS } from "./constants";

/**
 * Minimal shape used by the category / ranking / audience helpers.
 * Every field is optional so the helpers work on partially-loaded events
 * (API rows, discovery drafts, form state) without tight coupling.
 */
export interface EventLike {
  category?: string | null;
  suggestedAction?: string | null;
  coderRelevant?: boolean | null;
  isCoderEvent?: boolean | null;
  partnerId?: string | null;
  partner?: { id: string; name: string } | null;
  acceptanceLikelihood?: string | null;
  relevancyScore?: number | null;
  audienceSignals?: string | null;
  audienceDescription?: string | null;
  audienceSize?: number | null;
  title?: string | null;
  description?: string | null;
}

export type Category = "ATTEND" | "PARTICIPATE" | "SPEAK";

/** Parse the JSON-encoded audienceSignals column into a clean tag list. */
export function parseAudienceSignals(raw: string | null | undefined): string[] {
  if (!raw) return [];
  let list: unknown = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      // tolerate comma-separated legacy values
      list = raw.split(",");
    }
  }
  if (!Array.isArray(list)) return [];
  const allowed = new Set<string>(AUDIENCE_SIGNALS as readonly string[]);
  return list
    .map((s) => String(s).trim().toUpperCase().replace(/[\s-]+/g, "_"))
    .filter((s) => allowed.has(s))
    .filter((s, i, arr) => arr.indexOf(s) === i);
}

/** Serialize audience tags for storage. */
export function serializeAudienceSignals(tags: string[]): string {
  return JSON.stringify(
    tags
      .map((t) => t.trim().toUpperCase().replace(/[\s-]+/g, "_"))
      .filter((t) => (AUDIENCE_SIGNALS as readonly string[]).includes(t))
  );
}

/**
 * Two-level geography. Returns a specific `city` (or null) and a `macroRegion`
 * bucket (North America | UK | Europe | Middle East | Africa | Asia Pacific |
 * Online | Other). Order matters: specific cities win before country fallbacks.
 */
const CITY_TABLE: Array<{ m: string[]; city: string; macro: string }> = [
  { m: ["san francisco", "sf bay", "bay area"], city: "San Francisco", macro: "North America" },
  { m: ["santa clara"], city: "Santa Clara", macro: "North America" },
  { m: ["san jose"], city: "San Jose", macro: "North America" },
  { m: ["oakland"], city: "Oakland", macro: "North America" },
  { m: ["palo alto"], city: "Palo Alto", macro: "North America" },
  { m: ["mountain view"], city: "Mountain View", macro: "North America" },
  { m: ["sunnyvale"], city: "Sunnyvale", macro: "North America" },
  { m: ["silicon valley"], city: "Silicon Valley", macro: "North America" },
  { m: ["berkeley"], city: "Berkeley", macro: "North America" },
  { m: ["menlo park"], city: "Menlo Park", macro: "North America" },
  { m: ["cupertino"], city: "Cupertino", macro: "North America" },
  { m: ["austin", "sxsw"], city: "Austin", macro: "North America" },
  { m: ["dallas"], city: "Dallas", macro: "North America" },
  { m: ["houston"], city: "Houston", macro: "North America" },
  { m: ["denver"], city: "Denver", macro: "North America" },
  { m: ["nashville"], city: "Nashville", macro: "North America" },
  { m: ["atlanta"], city: "Atlanta", macro: "North America" },
  { m: ["charlotte"], city: "Charlotte", macro: "North America" },
  { m: ["raleigh"], city: "Raleigh", macro: "North America" },
  { m: ["las vegas"], city: "Las Vegas", macro: "North America" },
  { m: ["orlando"], city: "Orlando", macro: "North America" },
  { m: ["salt lake"], city: "Salt Lake City", macro: "North America" },
  { m: ["st. charles", "saint charles"], city: "St. Charles", macro: "North America" },
  { m: ["new york", "nyc"], city: "New York", macro: "North America" },
  { m: ["boston"], city: "Boston", macro: "North America" },
  { m: ["seattle"], city: "Seattle", macro: "North America" },
  { m: ["chicago"], city: "Chicago", macro: "North America" },
  { m: ["san diego"], city: "San Diego", macro: "North America" },
  { m: ["phoenix"], city: "Phoenix", macro: "North America" },
  { m: ["anaheim"], city: "Anaheim", macro: "North America" },
  { m: ["los angeles"], city: "Los Angeles", macro: "North America" },
  { m: ["toronto"], city: "Toronto", macro: "North America" },
  { m: ["vancouver"], city: "Vancouver", macro: "North America" },
  { m: ["montreal"], city: "Montreal", macro: "North America" },
  { m: ["london"], city: "London", macro: "UK" },
  { m: ["edinburgh"], city: "Edinburgh", macro: "UK" },
  { m: ["manchester"], city: "Manchester", macro: "UK" },
  { m: ["birmingham"], city: "Birmingham", macro: "UK" },
  { m: ["bristol"], city: "Bristol", macro: "UK" },
  { m: ["glasgow"], city: "Glasgow", macro: "UK" },
  { m: ["leeds"], city: "Leeds", macro: "UK" },
  { m: ["amsterdam"], city: "Amsterdam", macro: "Europe" },
  { m: ["the hague", "den haag"], city: "The Hague", macro: "Europe" },
  { m: ["rotterdam"], city: "Rotterdam", macro: "Europe" },
  { m: ["utrecht"], city: "Utrecht", macro: "Europe" },
  { m: ["eindhoven"], city: "Eindhoven", macro: "Europe" },
  { m: ["brussels"], city: "Brussels", macro: "Europe" },
  { m: ["berlin"], city: "Berlin", macro: "Europe" },
  { m: ["munich"], city: "Munich", macro: "Europe" },
  { m: ["cologne"], city: "Cologne", macro: "Europe" },
  { m: ["frankfurt"], city: "Frankfurt", macro: "Europe" },
  { m: ["hamburg"], city: "Hamburg", macro: "Europe" },
  { m: ["luxembourg"], city: "Luxembourg", macro: "Europe" },
  { m: ["paris"], city: "Paris", macro: "Europe" },
  { m: ["stockholm"], city: "Stockholm", macro: "Europe" },
  { m: ["copenhagen"], city: "Copenhagen", macro: "Europe" },
  { m: ["helsinki"], city: "Helsinki", macro: "Europe" },
  { m: ["oslo"], city: "Oslo", macro: "Europe" },
  { m: ["zurich"], city: "Zurich", macro: "Europe" },
  { m: ["geneva"], city: "Geneva", macro: "Europe" },
  { m: ["vienna"], city: "Vienna", macro: "Europe" },
  { m: ["milan"], city: "Milan", macro: "Europe" },
  { m: ["rome"], city: "Rome", macro: "Europe" },
  { m: ["madrid"], city: "Madrid", macro: "Europe" },
  { m: ["barcelona"], city: "Barcelona", macro: "Europe" },
  { m: ["lisbon"], city: "Lisbon", macro: "Europe" },
  { m: ["dublin"], city: "Dublin", macro: "Europe" },
  { m: ["prague"], city: "Prague", macro: "Europe" },
  { m: ["krakow", "krak\u00f3w"], city: "Krakow", macro: "Europe" },
  { m: ["warsaw"], city: "Warsaw", macro: "Europe" },
  { m: ["vilnius"], city: "Vilnius", macro: "Europe" },
  { m: ["valletta", "st. julian", "malta"], city: "Valletta", macro: "Europe" },
  { m: ["athens"], city: "Athens", macro: "Europe" },
  { m: ["dubai"], city: "Dubai", macro: "Middle East" },
  { m: ["abu dhabi"], city: "Abu Dhabi", macro: "Middle East" },
  { m: ["cape town"], city: "Cape Town", macro: "Africa" },
  { m: ["marrakesh", "marrakech"], city: "Marrakesh", macro: "Africa" },
  { m: ["johannesburg"], city: "Johannesburg", macro: "Africa" },
  { m: ["singapore"], city: "Singapore", macro: "Asia Pacific" },
  { m: ["sydney"], city: "Sydney", macro: "Asia Pacific" },
  { m: ["tokyo"], city: "Tokyo", macro: "Asia Pacific" },
  { m: ["bangalore", "bengaluru"], city: "Bangalore", macro: "Asia Pacific" },
];

export function deriveGeo(opts: {
  location?: string | null;
  region?: string | null;
  title?: string | null;
  isOnline?: boolean | null;
  type?: string | null;
}): { city: string | null; macroRegion: string } {
  const hay = ` ${(opts.location ?? "")} ${(opts.region ?? "")} ${(opts.title ?? "")} `.toLowerCase();
  for (const row of CITY_TABLE) if (row.m.some((w) => hay.includes(w))) return { city: row.city, macroRegion: row.macro };
  const has = (...ws: string[]) => ws.some((w) => hay.includes(w));
  const rx = (re: RegExp) => re.test(hay);
  if (has("netherlands")) return { city: null, macroRegion: "Europe" };
  if (has("united kingdom", "england", "scotland", "wales") || rx(/\buk\b/)) return { city: null, macroRegion: "UK" };
  if (has("united states", " usa", "u.s.a")) return { city: null, macroRegion: "North America" };
  if (has("canada")) return { city: null, macroRegion: "North America" };
  if (has("uae", "united arab", "qatar", "saudi", "riyadh", "doha", "bahrain", "kuwait")) return { city: null, macroRegion: "Middle East" };
  if (has("south africa", "morocco", "kenya", "nigeria", "egypt")) return { city: null, macroRegion: "Africa" };
  if (has("singapore", "australia", "japan", " india", "china", "hong kong", "korea", "asia")) return { city: null, macroRegion: "Asia Pacific" };
  if (has("belgium", "germany", "france", "spain", "italy", "portugal", "ireland", "sweden", "denmark", "norway", "finland", "switzerland", "austria", "poland", "czech", "luxembourg", "greece", "malta", "lithuania", "nordic", "europe")) return { city: null, macroRegion: "Europe" };
  if (opts.isOnline || opts.type === "PODCAST" || opts.type === "WEBINAR") return { city: null, macroRegion: "Online" };
  return { city: null, macroRegion: "Other" };
}

/** Back-compat: macro region only. */
export function canonicalRegion(opts: {
  location?: string | null;
  region?: string | null;
  title?: string | null;
  isOnline?: boolean | null;
  type?: string | null;
}): string {
  return deriveGeo(opts).macroRegion;
}

/**
 * The top-level track for an event. Uses the explicit `category` column when
 * set, otherwise derives one from legacy fields so existing rows still slot in.
 */
export function deriveCategory(ev: EventLike): Category {
  const explicit = (ev.category ?? "").toUpperCase();
  if (explicit === "ATTEND" || explicit === "PARTICIPATE" || explicit === "SPEAK") {
    return explicit;
  }
  const action = (ev.suggestedAction ?? "").toUpperCase();
  if (action === "APPLY_TO_SPEAK" || action === "BOTH") return "SPEAK";
  if (ev.isCoderEvent || ev.coderRelevant || ev.partnerId || ev.partner) return "PARTICIPATE";
  return "ATTEND";
}

const LIKELIHOOD_WEIGHT: Record<string, number> = { HIGH: 100, MEDIUM: 60, LOW: 25 };

const WOMEN_RE = /\bwomen\b|women[- ]?in[- ]?(tech|ai|data|stem)|wit\b|she\s?codes|girls?\s?who\s?code/i;

function hasSignal(ev: EventLike, tag: string): boolean {
  return parseAudienceSignals(ev.audienceSignals).includes(tag);
}

function looksWomenFocused(ev: EventLike): boolean {
  if (hasSignal(ev, "WOMEN_IN_TECH")) return true;
  const hay = `${ev.title ?? ""} ${ev.description ?? ""} ${ev.audienceDescription ?? ""}`;
  return WOMEN_RE.test(hay);
}

/**
 * A 0-100 score used to rank events *within* their track. Higher = higher up.
 * Each track weights different signals, matching CATEGORY_RANK_HINTS.
 */
export function categoryRank(ev: EventLike): number {
  const cat = deriveCategory(ev);
  const rel = ev.relevancyScore ?? 0;

  if (cat === "SPEAK") {
    // Likelihood of acceptance dominates; Women-in-Tech events are the most
    // realistic wins, so they get a boost.
    let score = LIKELIHOOD_WEIGHT[(ev.acceptanceLikelihood ?? "").toUpperCase()] ?? rel;
    if (looksWomenFocused(ev)) score += 20;
    return Math.min(100, score);
  }

  if (cat === "PARTICIPATE") {
    // Strategic value: where Coder's customers / partners are.
    let score = rel * 0.5;
    if (ev.partnerId || ev.partner) score += 25;
    if (ev.coderRelevant) score += 15;
    if (hasSignal(ev, "CUSTOMERS")) score += 15;
    if (hasSignal(ev, "PARTNERS")) score += 10;
    if (ev.isCoderEvent) score += 20;
    if ((ev.audienceSize ?? 0) >= 1000) score += 5;
    return Math.min(100, score);
  }

  // ATTEND: personal relevance.
  return rel;
}

/** Short human explanation of why an event ranks where it does in its track. */
export function categoryRankReason(ev: EventLike): string {
  const cat = deriveCategory(ev);
  if (cat === "SPEAK") {
    const lh = (ev.acceptanceLikelihood ?? "").toUpperCase();
    const parts: string[] = [];
    if (lh) parts.push(`${lh[0]}${lh.slice(1).toLowerCase()} chance of acceptance`);
    if (looksWomenFocused(ev)) parts.push("Women-in-Tech fit");
    return parts.join(" · ") || "Speaking fit";
  }
  if (cat === "PARTICIPATE") {
    const parts: string[] = [];
    if (ev.partner) parts.push(`Partner: ${ev.partner.name}`);
    if (hasSignal(ev, "CUSTOMERS")) parts.push("Customers present");
    if (hasSignal(ev, "PARTNERS")) parts.push("Partners present");
    if (ev.isCoderEvent) parts.push("On Coder schedule");
    return parts.join(" · ") || "Strategic for Coder";
  }
  return ev.relevancyScore != null ? `Relevance ${ev.relevancyScore}/100` : "Personal interest";
}

/** Sort a list of events by their in-track rank (desc), tie-broken by date. */
export function sortByCategoryRank<T extends EventLike & { startDate?: string | null; cfpDeadline?: string | null }>(
  evs: T[],
): T[] {
  return [...evs].sort((a, b) => {
    // Primary ranking: by date (soonest first); undated events sink to the bottom.
    const da = a.startDate ? new Date(a.startDate).getTime() : Infinity;
    const db2 = b.startDate ? new Date(b.startDate).getTime() : Infinity;
    if (da !== db2) return da - db2;
    // Tie-breaker: in-track rank (desc).
    const ra = categoryRank(a);
    const rb = categoryRank(b);
    return rb - ra;
  });
}
