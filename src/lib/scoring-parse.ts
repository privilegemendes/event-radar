/**
 * The pure half of the per-speaker scoring pass.
 *
 * Free of `server-only` and of Prisma, exactly like profile-schema.ts, so the
 * prompt and the reply parsing can be unit-tested without a database or an API
 * key. scoring.ts holds the parts that talk to both.
 */

/** Catalogue facts a scoring prompt is allowed to see. Deliberately no scores. */
export interface ScorableEvent {
  id: string;
  title: string;
  type: string;
  startDate?: Date | string | null;
  location?: string | null;
  city?: string | null;
  region?: string | null;
  isOnline?: boolean | null;
  description?: string | null;
  audienceDescription?: string | null;
  audienceSize?: number | null;
  otherSpeakers?: string | null;
  industry?: string | null;
  ticketCost?: string | null;
  cfpDeadline?: Date | string | null;
  howToApply?: string | null;
}

/** One speaker's judgement of one event, after validation. */
export interface EventScore {
  relevancyScore: number | null;
  relevancyRationale: string | null;
  acceptanceLikelihood: string | null;
  acceptanceRationale: string | null;
  suggestedAction: string | null;
  category: string | null;
  employerRelevant: boolean;
}

export const LIKELIHOODS = ["HIGH", "MEDIUM", "LOW"] as const;
export const ACTIONS = ["ATTEND", "APPLY_TO_SPEAK", "BOTH"] as const;
export const CATEGORIES = ["ATTEND", "PARTICIPATE", "SPEAK"] as const;

function isoDay(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** Render one event as the facts the model judges it on. */
export function renderEventFacts(e: ScorableEvent, index: number): string {
  const where = e.isOnline ? "Online" : e.location ?? e.city ?? e.region ?? "location unknown";
  return [
    `#${index}: "${e.title}"`,
    `type: ${e.type} | ${where}`,
    `date: ${isoDay(e.startDate) ?? "recurring or unannounced"}`,
    e.cfpDeadline ? `CFP closes: ${isoDay(e.cfpDeadline)}` : "",
    e.industry ? `industry: ${e.industry}` : "",
    e.audienceDescription
      ? `audience: ${e.audienceDescription}${e.audienceSize ? ` (~${e.audienceSize})` : ""}`
      : e.audienceSize ? `audience size: ~${e.audienceSize}` : "",
    e.otherSpeakers ? `past or confirmed speakers: ${e.otherSpeakers}` : "",
    e.ticketCost ? `ticket: ${e.ticketCost}` : "",
    e.howToApply ? `how to apply: ${e.howToApply}` : "",
    e.description ? `about: ${e.description}` : "",
  ].filter(Boolean).join("\n");
}

/**
 * The scoring prompt: one speaker's brief, one rubric, a batch of catalogue
 * facts.
 *
 * It says explicitly not to search, because this pass is only cheap if the
 * model works from what it is given — a web search here would rebuild the
 * discovery bill once per speaker, which is the exact thing the split exists
 * to stop.
 *
 * `geographyLine` is the speaker's priority locations. Discovery has always had
 * it, to decide where to search; scoring did not, so an event was judged on
 * topic and format with nothing to say how reachable it was. That put an Austin
 * meetup at 90 for an Amsterdam-based first-timer whose listed locations were
 * all European — the model answered correctly, the question was missing a
 * constraint. It is guidance rather than a cap, so a genuinely exceptional
 * event somewhere far away can still score well.
 */
export function buildScoringPrompt(
  speakerBlock: string,
  rubricBlock: string,
  events: ScorableEvent[],
  geographyLine = "",
): string {
  return `${speakerBlock}

${rubricBlock}
${geographyLine ? `\n${geographyLine}\n` : ""}
Score each event below FOR THIS SPEAKER, using ONLY the facts given. Do not
search the web and do not add details from memory — where a fact is missing,
judge on what is present and say so in the rationale.

Events:
${events.map(renderEventFacts).join("\n\n")}

Return a STRICT JSON array of exactly ${events.length} objects — nothing else, no
markdown fences — in the same order as the events, each keyed by its index:
[{
  "index": 0,
  "relevancyScore": 0-100 integer per the rubric above,
  "relevancyRationale": "1-2 sentences explaining the score for THIS speaker",
  "acceptanceLikelihood": "HIGH" | "MEDIUM" | "LOW",
  "acceptanceRationale": "one sentence on this speaker's odds of being accepted",
  "suggestedAction": "ATTEND" | "APPLY_TO_SPEAK" | "BOTH",
  "category": "ATTEND" | "PARTICIPATE" | "SPEAK",
  "employerRelevant": true only if the event is relevant to this speaker's employer as their profile describes it; false when the profile names no employer angle
}]`;
}

/**
 * Pull the JSON array out of a reply.
 *
 * Simpler than discovery's extractor on purpose: this reply has no web-search
 * citations wrapped around it, so the two hard cases there (prose either side,
 * nested string arrays) do not arise.
 */
export function extractScoreArray(text: string): unknown[] | null {
  const tryParse = (raw: string): unknown[] | null => {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : null; } catch { return null; }
  };

  const direct = tryParse(text.trim());
  if (direct) return direct;

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { const p = tryParse(fence[1].trim()); if (p) return p; }

  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end > start) return tryParse(text.slice(start, end + 1));

  return null;
}

/**
 * Validate one raw entry into a score.
 *
 * Anything the model returns outside the allowed values becomes null rather
 * than reaching the database: an unscored row shows as "not yet judged" in the
 * UI, which is honest, where a junk enum value is a rendering bug.
 */
export function normaliseScore(raw: unknown): EventScore {
  const r = (raw ?? {}) as Record<string, unknown>;

  const rawScore = Number(r.relevancyScore);
  const score = r.relevancyScore != null && Number.isFinite(rawScore)
    ? Math.round(Math.min(100, Math.max(0, rawScore)))
    : null;

  const pick = (v: unknown, allowed: readonly string[]) =>
    typeof v === "string" && allowed.includes(v) ? v : null;

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  return {
    relevancyScore: score,
    relevancyRationale: str(r.relevancyRationale),
    acceptanceLikelihood: pick(r.acceptanceLikelihood, LIKELIHOODS),
    acceptanceRationale: str(r.acceptanceRationale),
    suggestedAction: pick(r.suggestedAction, ACTIONS),
    category: pick(r.category, CATEGORIES),
    employerRelevant: r.employerRelevant === true,
  };
}

/**
 * Match a reply entry back to the event it judges.
 *
 * Prefers the model's own `index` and falls back to position. Returning null
 * for an out-of-range index matters: silently falling back to position there
 * would write one event's judgement onto a different event, which is worse
 * than not scoring it at all.
 */
export function resolveIndex(raw: unknown, position: number, batchSize: number): number | null {
  const declared = (raw as { index?: unknown } | null)?.index;
  if (typeof declared === "number" && Number.isInteger(declared)) {
    return declared >= 0 && declared < batchSize ? declared : null;
  }
  return position < batchSize ? position : null;
}
