import { SPEAKING_LEVELS, type ApplicantProfile, type SpeakingLevel } from "./profile-schema";

/**
 * Renders the LLM-facing blocks (speaker profile, scoring rubric, exclusions,
 * focus themes) from the stored profile.
 *
 * These blocks used to be five hardcoded string constants spread across
 * discovery, analyze, pitch and the two speaker routes. They had drifted apart,
 * and every one of them named a single person. Everything here is a pure
 * function of the profile so it can be unit-tested without a database or an
 * API key — see speaker-brief.test.ts.
 */

/* ── Defaults ─────────────────────────────────────────────────────────────
 * Applied when a profile field is blank, so a half-filled profile still
 * produces a coherent prompt rather than one with holes in it.
 */
const DEFAULT_LEVEL: SpeakingLevel = "FIRST_TIME";
const DEFAULT_NAME = "the speaker";

/**
 * Split a textarea value into trimmed entries, one per line.
 *
 * Newlines only — NOT commas. Entries routinely contain a comma of their own
 * ("Amsterdam, NL"; "Nomad Cruise 17, Sept 2026"), and splitting on them turns
 * one location into two bogus ones.
 */
export function parseList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Render a list as prompt bullets, or a fallback line when empty. */
function bullets(items: string[], fallback: string): string {
  return items.length ? items.map((i) => `• ${i}`).join("\n") : `• ${fallback}`;
}

function inline(items: string[], fallback: string): string {
  return items.length ? items.join(", ") : fallback;
}

/* ── Pronouns ─────────────────────────────────────────────────────────────
 * The old prompts hardcoded "her" / "she" in 24 places. Prompts are written in
 * the third person, so getting this wrong misgenders a real person in the text
 * the model then writes back. Unknown or unparseable falls back to they/them.
 */
export interface Pronouns { subject: string; object: string; possessive: string }

const PRONOUN_TABLE: Record<string, Pronouns> = {
  she:  { subject: "she",  object: "her",  possessive: "her"   },
  he:   { subject: "he",   object: "him",  possessive: "his"   },
  they: { subject: "they", object: "them", possessive: "their" },
};

export function parsePronouns(raw: string | null | undefined): Pronouns {
  const first = (raw ?? "").trim().toLowerCase().split(/[/\s]+/)[0];
  return PRONOUN_TABLE[first] ?? PRONOUN_TABLE.they;
}

export function speakingLevelOf(profile: Pick<ApplicantProfile, "speakingLevel">): SpeakingLevel {
  const v = (profile.speakingLevel ?? "").trim().toUpperCase() as SpeakingLevel;
  return SPEAKING_LEVELS.includes(v) ? v : DEFAULT_LEVEL;
}

export function speakerName(profile: Pick<ApplicantProfile, "fullName">): string {
  return (profile.fullName ?? "").trim() || DEFAULT_NAME;
}

/* ── Speaker profile block ────────────────────────────────────────────────
 * Three forms, because the five original copies served three purposes:
 *   full     → discovery + analyze: who am I scoring events for
 *   outreach → speakers/discover: who am I, and why am I reaching out
 *   compact  → speakers/note: one line, token-thrifty for a small call
 */
export type ProfileForm = "full" | "outreach" | "compact";

const LEVEL_SELF_DESCRIPTION: Record<SpeakingLevel, string> = {
  FIRST_TIME:  "first-time speaker building a track record",
  OCCASIONAL:  "occasional speaker with a handful of talks given",
  ESTABLISHED: "established speaker who speaks regularly",
  KEYNOTE:     "keynote speaker who headlines events",
};

const LEVEL_CEILING: Record<SpeakingLevel, string> = {
  FIRST_TIME:
    "NOT realistic yet: keynotes at large enterprise/developer mega-conferences (AWS re:Invent, KubeCon, Microsoft Ignite, Gartner, Dreamforce).",
  OCCASIONAL:
    "NOT realistic yet: headline keynotes at the largest industry mega-conferences.",
  ESTABLISHED:
    "Below the useful range: very small local meetups with no strategic audience.",
  KEYNOTE:
    "Below the useful range: small local meetups and community events — attend to network, not to speak.",
};

const LEVEL_STAGE: Record<SpeakingLevel, string> = {
  FIRST_TIME:  "meetups, podcasts, workshops, small summits, founder communities, entrepreneur events",
  OCCASIONAL:  "meetups, podcasts, workshops, small and mid-size summits, community tracks at larger conferences",
  ESTABLISHED: "mid-size and large conferences, featured tracks, established podcasts, industry summits",
  KEYNOTE:     "keynote and headline slots at flagship industry conferences, major summits, high-profile podcasts",
};

export function buildSpeakerProfile(profile: ApplicantProfile, form: ProfileForm = "full"): string {
  const name = speakerName(profile);
  const level = speakingLevelOf(profile);
  const p = parsePronouns(profile.pronouns);
  const topics = parseList(profile.signatureTopics);
  const credentials = parseList(profile.credentials);
  const employer = (profile.employerAngle ?? "").trim();

  if (form === "compact") {
    const parts = [`${name} — ${LEVEL_SELF_DESCRIPTION[level]}.`];
    if (employer) parts.push(`${employer}.`);
    if (topics.length) parts.push(`Signature topics: ${inline(topics, "")}.`);
    if (credentials.length) parts.push(`Credentials: ${credentials[0]}.`);
    return parts.join(" ");
  }

  const lines = [`${name} — ${LEVEL_SELF_DESCRIPTION[level]}.`];
  if (employer) {
    lines.push(`• Day job: ${employer}`);
  }
  if (credentials.length) {
    lines.push(`• Speaking credentials: ${inline(credentials, "")}`);
  }
  lines.push(`• Best-fit topics: ${inline(topics, "not specified — infer from the event context")}`);
  lines.push(`• Realistic stage: ${LEVEL_STAGE[level]}.`);
  lines.push(`• ${LEVEL_CEILING[level]}`);

  if (form === "outreach") {
    lines.push(
      `• Goal: connect with experienced speakers in these topics to (a) ask advice on speaking, and (b) explore opportunities they can point ${p.object} to.`,
    );
  }
  return lines.join("\n");
}

/* ── Scoring rubric ───────────────────────────────────────────────────────
 * A first-timer and a keynote speaker want opposite things from the same
 * event, so the bands invert across levels rather than being reworded. A
 * non-empty rubricOverride replaces the generated rubric wholesale.
 */
interface RubricBand { range: string; venues: string; action: string }

const RUBRIC_BANDS: Record<SpeakingLevel, RubricBand[]> = {
  FIRST_TIME: [
    { range: "85-100", venues: "Meetups, podcasts, workshops, founder/entrepreneur communities, AI-literacy events for individuals, small summits with open speaker tracks. Realistically winnable.", action: "APPLY_TO_SPEAK" },
    { range: "65-84",  venues: "Medium-size conferences with community tracks, lightning talks or open CFPs; webinars; events whose audience includes the target topics. Competitive but achievable.", action: "APPLY_TO_SPEAK or BOTH" },
    { range: "40-64",  venues: "Larger conferences with open CFPs but high competition; adjacent topics; worth applying to niche or lightning tracks.", action: "BOTH" },
    { range: "20-39",  venues: "Big enterprise/developer mega-conferences — attend for networking only, speaking unrealistic for a first-timer.", action: "ATTEND" },
    { range: "0-19",   venues: "Academic/research conferences; events attended in an employer role rather than as a speaker; highly specialised events with no audience overlap.", action: "ATTEND" },
  ],
  OCCASIONAL: [
    { range: "85-100", venues: "Meetups, podcasts, workshops and small-to-mid summits with open speaker tracks in the target topics. Strong fit for a growing track record.", action: "APPLY_TO_SPEAK" },
    { range: "65-84",  venues: "Mid-size conferences with community or featured tracks; established podcasts; regional industry summits.", action: "APPLY_TO_SPEAK or BOTH" },
    { range: "40-64",  venues: "Large conferences with open CFPs and high competition; adjacent-topic events.", action: "BOTH" },
    { range: "20-39",  venues: "Flagship mega-conferences where a headline slot is still out of reach; attend and network.", action: "ATTEND" },
    { range: "0-19",   venues: "Academic events; employer-role attendance; no audience overlap.", action: "ATTEND" },
  ],
  ESTABLISHED: [
    { range: "85-100", venues: "Mid-size and large conferences with featured or track-level speaking slots in the target topics; well-known podcasts; industry summits with real audience reach.", action: "APPLY_TO_SPEAK" },
    { range: "65-84",  venues: "Flagship conferences with open CFPs; large webinars and panels; regional editions of major events.", action: "APPLY_TO_SPEAK or BOTH" },
    { range: "40-64",  venues: "Smaller community events with an unusually relevant audience, or adjacent-topic conferences worth the reach.", action: "BOTH" },
    { range: "20-39",  venues: "Local meetups and small community events — limited reach for this speaker; attend only if the network justifies it.", action: "ATTEND" },
    { range: "0-19",   venues: "Academic events; employer-role attendance; no audience overlap.", action: "ATTEND" },
  ],
  KEYNOTE: [
    { range: "85-100", venues: "Keynote and headline slots at flagship industry conferences and major summits in the target topics; high-profile podcasts with large audiences.", action: "APPLY_TO_SPEAK" },
    { range: "65-84",  venues: "Large conferences offering featured or main-stage tracks; major regional editions; well-known industry panels.", action: "APPLY_TO_SPEAK or BOTH" },
    { range: "40-64",  venues: "Mid-size conferences and established podcasts — worthwhile when the audience is exactly on-topic.", action: "BOTH" },
    { range: "20-39",  venues: "Small conferences and community events — below the useful range for a headline speaker; attend to network.", action: "ATTEND" },
    { range: "0-19",   venues: "Local meetups; academic events; employer-role attendance; no audience overlap.", action: "ATTEND" },
  ],
};

export function buildScoringRubric(profile: ApplicantProfile): string {
  const override = (profile.rubricOverride ?? "").trim();
  if (override) return override;

  const level = speakingLevelOf(profile);
  const topics = parseList(profile.signatureTopics);
  const bands = RUBRIC_BANDS[level]
    .map((b) => `${b.range} → ${b.venues} suggestedAction: ${b.action}.`)
    .join("\n\n");

  return `RELEVANCY SCORE (0-100) — how realistic AND valuable it is for THIS speaker to get a speaking slot:

${bands}

Target topics for this speaker: ${inline(topics, "not specified — judge on general audience fit")}.

industry field: a short label for the vertical, e.g. "startups/entrepreneurship", "enterprise IT", "fintech", "AI/ML research", "developer tools", "founder communities", "AI education", "corporate innovation".`;
}

/* ── Exclusions ───────────────────────────────────────────────────────────
 * Previously a fixed seven-item list tuned to one person. An infosec speaker
 * wants precisely the categories that list threw away, so it now comes from
 * the profile. Blank means no exclusions — say so explicitly rather than
 * emitting an empty heading the model has to interpret.
 */
export function buildExclusions(profile: ApplicantProfile): string {
  const excluded = parseList(profile.excludedDomains);
  if (!excluded.length) {
    return "No category exclusions — judge every event on audience fit and the scoring rubric alone.";
  }
  return `STRICT EXCLUSIONS — omit these from results entirely, even if found in search:
${bullets(excluded, "")}
Exception: include an otherwise-excluded event IF it is explicitly hosted or sponsored by a tracked partner and the request is a partner-scoped discovery.`;
}

/* ── Focus themes ─────────────────────────────────────────────────────────
 * Replaces the 21 hardcoded rotation themes. Built as a cross-product of the
 * speaker's geographies and topics with the search slices documented in
 * docs/EVENT_SEARCH_DIRECTIVES.md, so depth comes from distinct slices rather
 * than one broad pass. Deterministic, so weekly rotation stays stable.
 */
const GEO_SLICES = [
  (g: string) => `${g} — AI and technology conferences and summits`,
  (g: string) => `${g} — founder and entrepreneur meetups and communities (meetup.com, lu.ma, Eventbrite)`,
  (g: string) => `${g} — workshops, bootcamps and hands-on sessions`,
];

const TOPIC_SLICES = [
  (t: string) => `${t} — conferences and summits with open CFPs`,
  (t: string) => `${t} — podcasts and webinars seeking guest speakers`,
];

const GENERIC_SLICES = [
  "podcasts and online shows actively seeking guest speakers",
  "online webinars and virtual summits with open speaker tracks",
];

export function buildFocusThemes(profile: ApplicantProfile): string[] {
  const geos = parseList(profile.homeGeographies);
  const topics = parseList(profile.signatureTopics);

  const themes: string[] = [];
  for (const g of geos) for (const slice of GEO_SLICES) themes.push(slice(g));
  for (const t of topics) for (const slice of TOPIC_SLICES) themes.push(slice(t));
  themes.push(...GENERIC_SLICES);

  // De-duplicate while preserving order; never return empty (the caller
  // rotates over this list and an empty focus disables the rotation).
  return [...new Set(themes)];
}

/** Pick a focus theme that rotates weekly over the generated list. */
export function rotatingFocusFrom(themes: string[], seed = Date.now()): string {
  if (!themes.length) return "";
  const slot = Math.floor(seed / (1000 * 60 * 60 * 24 * 7));
  return themes[slot % themes.length];
}


/* ── Search plan ──────────────────────────────────────────────────────────
 * The numbered list of web searches the discovery prompt asks for. Previously
 * ten hardcoded blocks naming specific cities, topics and an employer; now a
 * cross-product of the speaker's own geographies and topics with the slice
 * kinds documented in docs/EVENT_SEARCH_DIRECTIVES.md.
 *
 * Search years are derived from `year` rather than written into the prompt, so
 * the plan does not silently rot into searching for past events.
 */
export function buildSearchPlan(profile: ApplicantProfile, year: number): string {
  const geos = parseList(profile.homeGeographies);
  const topics = parseList(profile.signatureTopics);
  const employer = (profile.employerAngle ?? "").trim();
  const years = `${year} ${year + 1} ${year + 2}`;

  const blocks: string[] = [];

  for (const g of geos) {
    blocks.push(
      `**${g}** — cover every month across ${years}, not just the coming weeks. Search "${g} AI conference ${years} speakers", "${g} founder meetup AI ${years}", "${g} startup AI event ${years}", "${g} AI workshop ${years}". Mine the community platforms for recurring groups in this location: meetup.com, lu.ma, Eventbrite.`,
    );
  }

  for (const t of topics) {
    blocks.push(
      `**${t}** — search "${t} conference ${years} call for speakers", "${t} summit ${years} CFP", "${t} workshop ${years} presenter", "${t} event speaker application".`,
    );
  }

  blocks.push(
    `**Podcasts and online shows seeking guests** — search "${topics[0] ?? "AI"} podcast guest application", "podcast accepting guests ${years}", "call for podcast guests ${year}". Type PODCAST, usually isOnline true, region "Online". Put the guest-application or contact URL in applyUrl or howToApply.`,
  );

  blocks.push(
    `**Online webinars and virtual summits** — search "${topics[0] ?? "AI"} webinar ${years} speakers", "virtual summit ${year} call for speakers", "online workshop ${year} facilitator". Type WEBINAR, isOnline true.`,
  );

  if (employer) {
    blocks.push(
      `**Employer-relevant events** — events where this speaker's employer's customers and partners gather, given: ${employer} Search for industry, analyst and vendor events matching that positioning. These are usually PARTICIPATE (attend in the employer role) rather than personal speaking slots; score them honestly and flag a speaker or panel track only where one genuinely exists.`,
    );
  }

  return blocks.map((b, i) => `${i + 1}. ${b}`).join("\n\n");
}

/* ── Geography priority line ──────────────────────────────────────────────*/
export function buildGeographyLine(profile: ApplicantProfile): string {
  const geos = parseList(profile.homeGeographies);
  if (!geos.length) return "No geographic preference — include events anywhere, and online.";
  return `PRIORITISE events located in: ${inline(geos, "")}, or ONLINE. Skip events elsewhere unless they are a flagship annual event in the target topics.`;
}

/* ── Private-event keywords ───────────────────────────────────────────────
 * Replaces the hardcoded digital-nomad regex in owner.ts. Substring matching,
 * case-insensitive — no regex, so a user-supplied keyword cannot blow up the
 * insert loop with a bad pattern.
 */
export function isPrivateEvent(
  event: { title?: string | null; description?: string | null; industry?: string | null; audienceDescription?: string | null; sourceNote?: string | null },
  keywords: string[],
): boolean {
  if (!keywords.length) return false;
  const hay = [event.title, event.description, event.industry, event.audienceDescription, event.sourceNote]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return keywords.some((k) => hay.includes(k.trim().toLowerCase()));
}
