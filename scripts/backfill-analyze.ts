/**
 * One-time backfill: sends existing events to Claude for analysis and writes
 * industry / relevancyScore / relevancyRationale / suggestedAction back to the DB.
 * Run: tsx scripts/backfill-analyze.ts
 */
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
dotenv.config();

const db = new PrismaClient();

const SPEAKER_PROFILE = `Irmak Eyiceoglu — first-time speaker building a track record.
• Day job: EMEA Partner Manager at Coder (AI devtools / self-hosted cloud dev environments, $90M Series C). Partner events = networking in her Coder role, NOT personal speaking.
• Speaking credential: confirmed speaker at Nomad Cruise 17 AI Edition (Sept 2026, Atlantic crossing, 150 founders & digital nomads aboard Queen Mary 2).
• Best-fit topics: Sovereign AI, practical AI for non-technical founders/entrepreneurs, AI literacy for individuals.
• Realistic stage: meetups, podcasts, workshops, small summits, founder communities, entrepreneur events.
• NOT realistic yet: keynotes at mega-conferences (AWS re:Invent, KubeCon, Microsoft Ignite, Gartner, Dreamforce).`;

const SCORING_RUBRIC = `RELEVANCY SCORE (0-100):
85-100 → Meetups, podcasts, workshops, founder/entrepreneur communities, digital nomad events, AI literacy events, small summits with open speaker tracks. suggestedAction: APPLY_TO_SPEAK.
65-84  → Medium tech/startup conferences with open tracks; AI webinars; events where audience includes entrepreneurs/founders. suggestedAction: APPLY_TO_SPEAK or BOTH.
40-64  → Larger conferences with CFPs but high competition; adjacent topics. suggestedAction: BOTH.
20-39  → Big enterprise/developer mega-conferences (attend for networking only). suggestedAction: ATTEND.
0-19   → Academic events; partner-hosted events (Coder EMEA partner manager networking); cybersecurity/infosec events; narrow single-vertical events (fintech-only, healthcare-only, government procurement, transport, utilities). suggestedAction: ATTEND.

industry field: short vertical label, e.g. "startups/entrepreneurship", "enterprise IT", "digital nomads", "fintech", "AI education", "developer tools", "sovereign AI", "corporate innovation", "founder communities", "broadcasting/media", "government/public sector", "finance/banking".

suggestedAction: "ATTEND" | "APPLY_TO_SPEAK" | "BOTH"`;

type AnalysisResult = {
  industry?: string | null;
  description?: string | null;
  audienceDescription?: string | null;
  audienceSize?: number | null;
  relevancyScore?: number | null;
  relevancyRationale?: string | null;
  suggestedAction?: string | null;
  applyUrl?: string | null;
  socialLinks?: Record<string, string | null> | null;
};

async function main() {
  const baseUrl   = process.env.ANTHROPIC_BASE_URL;
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
  if (!baseUrl || !authToken) {
    console.error("ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN not set");
    process.exit(1);
  }

  const events = await db.event.findMany({
    where: {
      OR: [{ relevancyScore: null }, { industry: null }, { applyUrl: null }],
    },
    include: { partner: { select: { name: true, category: true } } },
  });

  if (events.length === 0) {
    console.log("All events already have scores. Nothing to do.");
    return;
  }

  console.log(`Analyzing ${events.length} events…`);

  // Process in batches of 20 to stay within context limits
  const BATCH = 20;
  let totalUpdated = 0;

  for (let offset = 0; offset < events.length; offset += BATCH) {
    const batch = events.slice(offset, offset + BATCH);
    console.log(`  Batch ${Math.floor(offset / BATCH) + 1}: events ${offset + 1}–${Math.min(offset + BATCH, events.length)}`);

    const eventList = batch.map((ev, i) => {
      const partnerNote = ev.partner ? `Partner: ${ev.partner.name} (${ev.partner.category})` : "No partner";
      return `#${i + 1}: "${ev.title}"
Type: ${ev.type} | ${ev.isOnline ? "Online" : ev.location ?? "Location unknown"}
${partnerNote}
Description: ${ev.description ?? "none provided"}
Audience: ${ev.audienceDescription ?? "unknown"}
Other speakers: ${ev.otherSpeakers ?? "unknown"}`;
    }).join("\n\n");

    const prompt = `You are analyzing ${batch.length} speaking opportunity events for this speaker:

${SPEAKER_PROFILE}

${SCORING_RUBRIC}

Analyze each event below and return a JSON array of exactly ${batch.length} objects IN THE SAME ORDER as the list.

Events:
${eventList}

Return ONLY the JSON array. Each object:
{
  "industry": "short vertical label",
  "description": "1-2 sentence description (fill if missing, keep concise)",
  "audienceDescription": "who the audience is",
  "audienceSize": integer estimate or null,
  "relevancyScore": 0-100 integer,
  "relevancyRationale": "1-2 sentences explaining the score",
  "suggestedAction": "ATTEND" | "APPLY_TO_SPEAK" | "BOTH"
}`;

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        Authorization: `Bearer ${authToken}`,
        "x-api-key": authToken,
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`  LLM error: ${err.slice(0, 200)}`);
      continue;
    }

    const data = await response.json() as { content: Array<{ type: string; text?: string }> };
    const text = data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");

    let results: AnalysisResult[] = [];
    try {
      const parsed = JSON.parse(text.trim());
      if (Array.isArray(parsed)) results = parsed;
    } catch {
      const m = text.match(/\[[\s\S]*\]/g);
      if (m) {
        for (const candidate of [...m].sort((a, b) => b.length - a.length)) {
          try { results = JSON.parse(candidate); break; } catch { /* next */ }
        }
      }
    }

    if (results.length === 0) {
      console.error("  Could not parse response — skipping batch");
      continue;
    }

    const validActions = ["ATTEND", "APPLY_TO_SPEAK", "BOTH"];

    for (let i = 0; i < batch.length; i++) {
      const ev  = batch[i];
      const res = results[i];
      if (!res) continue;

      const score  = res.relevancyScore != null ? Math.min(100, Math.max(0, Number(res.relevancyScore))) : null;
      const action = res.suggestedAction && validActions.includes(res.suggestedAction) ? res.suggestedAction : null;

      await db.event.update({
        where: { id: ev.id },
        data: {
          industry:            res.industry            ?? ev.industry,
          description:         ev.description          ?? res.description ?? null,
          audienceDescription: ev.audienceDescription  ?? res.audienceDescription ?? null,
          audienceSize:        ev.audienceSize          ?? (res.audienceSize != null ? Number(res.audienceSize) : null),
          relevancyScore:      score                   ?? ev.relevancyScore,
          relevancyRationale:  res.relevancyRationale  ?? ev.relevancyRationale,
          suggestedAction:     action                  ?? ev.suggestedAction,
          applyUrl:            res.applyUrl            ?? ev.applyUrl,
          socialLinks:         (res.socialLinks && Object.values(res.socialLinks).some(Boolean))
            ? JSON.stringify(res.socialLinks)
            : (ev.socialLinks ?? null),
        },
      });

      console.log(`    ✓ [${score ?? "??"}/100] ${action ?? "??"} — ${ev.title.slice(0, 60)}`);
      totalUpdated++;
    }
  }

  console.log(`\nDone. Updated ${totalUpdated}/${events.length} events.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
