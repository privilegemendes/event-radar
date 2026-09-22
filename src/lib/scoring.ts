import { db } from "@/lib/db";
import { profileFromRow } from "@/lib/profile-schema";
import { buildSpeakerProfile, buildScoringRubric } from "@/lib/speaker-brief";
import {
  buildScoringPrompt,
  extractScoreArray,
  normaliseScore,
  resolveIndex,
  type ScorableEvent,
} from "@/lib/scoring-parse";

/**
 * Score catalogue events for ONE speaker.
 *
 * The second half of the Phase 4 split:
 *
 *   discovery — find events. Web search, expensive, run once for everyone.
 *   scoring   — judge them. No web search, cheap, run once per speaker.
 *
 * These were a single call, so every speaker paid for their own web-search
 * discovery of events that are identical for all of them, and then received a
 * score computed against somebody else's brief. Finding is shareable; judging
 * is not. Separating them is what makes a second speaker cheap instead of a
 * second full bill.
 *
 * Scoring needs no web search because it judges facts already in the
 * catalogue. If it ever grows one, the saving is gone — enrich the catalogue
 * instead, once, for everybody.
 *
 * No `server-only` here, and the profile is read straight off the table rather
 * than through settings.ts — both matching discovery.ts, its sibling. Those
 * modules are driven by scripts under scripts/, which run outside Next and
 * cannot resolve `server-only`; importing settings.ts would drag it back in.
 */

const MODEL = "claude-sonnet-4-5";

/** Events per LLM call. Large enough to amortise the brief, small enough that
 *  one malformed reply does not cost a whole run. */
const BATCH = 25;

export interface ScoringOutcome {
  ok: boolean;
  scored: number;
  considered: number;
  error?: string;
  status?: number;
}

const EVENT_FACTS = {
  id: true, title: true, type: true, startDate: true, location: true,
  isOnline: true, region: true, city: true, description: true,
  audienceDescription: true, audienceSize: true, otherSpeakers: true,
  industry: true, ticketCost: true, cfpDeadline: true, howToApply: true,
} as const;

/**
 * Score every catalogue event this speaker has no judgement for yet.
 *
 * Only unscored rows are touched, so this is safe to re-run and will never
 * overwrite a score a speaker has already seen or corrected. `limit` bounds
 * one invocation; call it again to work through a backlog.
 */
export async function scoreForSpeaker(
  userId: string,
  opts: { limit?: number } = {},
): Promise<ScoringOutcome> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);

  /* Upcoming and undated events only. Scoring a conference that already
     happened spends money on a row nobody can act on. */
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const events = await db.event.findMany({
    where: {
      OR: [{ startDate: { gte: today } }, { startDate: null }],
      opportunities: { none: { userId, relevancyScore: { not: null } } },
    },
    select: EVENT_FACTS,
    orderBy: [{ startDate: { sort: "asc", nulls: "last" } }],
    take: limit,
  });

  if (events.length === 0) return { ok: true, scored: 0, considered: 0 };

  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
  if (!baseUrl || !authToken) {
    return { ok: false, scored: 0, considered: events.length, error: "Anthropic credentials not configured", status: 503 };
  }

  const row = await db.speakerProfile.findUnique({ where: { userId } });
  const profile = profileFromRow(row as unknown as Record<string, unknown> | null);
  const speakerBlock = buildSpeakerProfile(profile, "full");
  const rubricBlock = buildScoringRubric(profile);

  let scored = 0;

  for (let offset = 0; offset < events.length; offset += BATCH) {
    const batch = events.slice(offset, offset + BATCH) as ScorableEvent[];
    const prompt = buildScoringPrompt(speakerBlock, rubricBlock, batch);

    let text: string;
    try {
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          Authorization: `Bearer ${authToken}`,
          "x-api-key": authToken,
        },
        // No `tools`, deliberately — see the note at the top of this file.
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 8000,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        return { ok: false, scored, considered: events.length, error: `LLM error ${response.status}`, status: 502 };
      }

      const data = await response.json() as { content: Array<{ type: string; text?: string }> };
      text = data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
    } catch (err) {
      console.error("Scoring request failed:", err);
      return { ok: false, scored, considered: events.length, error: "Scoring request failed", status: 500 };
    }

    const parsed = extractScoreArray(text);
    if (!parsed) {
      // One unreadable batch should not sink the rest of the run; the events
      // it covered stay unscored and the next call picks them up again.
      console.warn(`Scoring: could not parse a batch of ${batch.length} for ${userId}`);
      continue;
    }

    for (let i = 0; i < parsed.length; i++) {
      const index = resolveIndex(parsed[i], i, batch.length);
      if (index === null) continue;

      const target = batch[index];
      const data = normaliseScore(parsed[i]);

      await db.eventOpportunity.upsert({
        where: { userId_eventId: { userId, eventId: target.id } },
        create: { userId, eventId: target.id, status: "DISCOVERED", ...data },
        update: data,
      });
      scored++;
    }
  }

  return { ok: true, scored, considered: events.length };
}

/**
 * Score for every speaker who has a profile.
 *
 * Used by the cron job after a discovery pass. Runs one speaker at a time
 * rather than in parallel: the work is not latency-sensitive, and a fan-out of
 * concurrent LLM calls is the easy way to hit a rate limit and lose a run.
 */
export async function scoreForAllSpeakers(opts: { limit?: number } = {}): Promise<{
  speakers: number;
  scored: number;
  errors: string[];
}> {
  const speakers = await db.speakerProfile.findMany({ select: { userId: true } });
  let scored = 0;
  const errors: string[] = [];

  for (const sp of speakers) {
    const result = await scoreForSpeaker(sp.userId, opts);
    scored += result.scored;
    if (!result.ok && result.error) errors.push(`${sp.userId}: ${result.error}`);
  }

  return { speakers: speakers.length, scored, errors };
}
