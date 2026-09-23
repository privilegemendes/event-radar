import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAnthropic, messagesUrl, WEB_SEARCH_BETA } from "@/lib/anthropic";
import { requireAdmin, authErrorResponse } from "@/lib/session";
import { getApplicantProfile } from "@/lib/settings";
import { buildSpeakerProfile, buildScoringRubric } from "@/lib/speaker-brief";

export const maxDuration = 300;

type AnalysisResult = {
  industry?: string | null;
  description?: string | null;
  audienceDescription?: string | null;
  audienceSize?: number | null;
  relevancyScore?: number | null;
  relevancyRationale?: string | null;
  suggestedAction?: string | null;
  applyUrl?: string | null;
  ticketCost?: string | null;
  category?: string | null;
  audienceSignals?: string[] | null;
  socialLinks?: Record<string, string | null> | null;
};

export async function POST() {
  try {
    const session = await requireAdmin();
    // Find events needing enrichment (missing score, industry, or applyUrl)
    /* Events this speaker has not scored yet. The gap is in THEIR opportunity,
       not on the event: another speaker having scored it says nothing about
       whether this one has. */
    const events = await db.event.findMany({
      where: {
        OR: [
          { opportunities: { none: { userId: session.userId } } },
          { opportunities: { some: { userId: session.userId, relevancyScore: null } } },
          { opportunities: { some: { userId: session.userId, category: null } } },
          { applyUrl: null },
          { ticketCost: null },
        ],
      },
      include: {
        partner: { select: { name: true, category: true } },
        opportunities: { where: { userId: session.userId }, take: 1 },
      },
      take: 20, // keep batches smaller since we use web search
    });

    if (events.length === 0)
      return NextResponse.json({ ok: true, analyzed: 0, message: "All events already have scores and links" });

    const anthropic = resolveAnthropic(process.env, { beta: WEB_SEARCH_BETA });
    if (!anthropic)
      return NextResponse.json({ error: "Anthropic credentials not configured" }, { status: 503 });

    /* This speaker's brief: the upsert below writes session.userId's own
       opportunity rows, so scoring them against the owner's brief put one
       person's judgement under another person's name. */
    const profile = await getApplicantProfile(session.userId);
    const speakerBlock = buildSpeakerProfile(profile, "full");
    const rubricBlock = buildScoringRubric(profile);

    const eventList = events.map((ev, i) => {
      const partnerNote = ev.partner ? `Partner: ${ev.partner.name} (${ev.partner.category})` : "No partner link";
      return `#${i + 1}: "${ev.title}"
Type: ${ev.type} | ${ev.isOnline ? "Online" : ev.location ?? "Location unknown"}
${partnerNote}
Existing URL: ${ev.url ?? "none"}
Description: ${ev.description ?? "none"}
Audience: ${ev.audienceDescription ?? "unknown"}`;
    }).join("\n\n");

    const prompt = `You are analyzing ${events.length} speaking opportunity events for this speaker:

${speakerBlock}

${rubricBlock}

IMPORTANT: For each event, use web search to find:
1. The direct URL to submit a speaker application / CFP form / attendee registration (applyUrl). Only return URLs you actually find in search results — do NOT guess or invent URLs.
2. The event's social media pages: LinkedIn page/event, Instagram, X/Twitter, YouTube, Facebook. Only return URLs you verified exist. Use null for platforms not found.
3. The ticket / attendance cost (ticketCost) — the price to ATTEND, not speaker pay. Use "Free" for free events (most meetups/webinars/podcasts), a concrete price or range if published (e.g. "~€1,995", "From €99"), or null if you cannot find it. Do not invent prices.

For each event, search for:
- The event name + "apply to speak" / "CFP" / "speaker application" / "register"
- The event name + "LinkedIn" / "Instagram" / "Twitter" / "Facebook" / "YouTube"

Events to analyze:
${eventList}

Return ONLY a JSON array of exactly ${events.length} objects IN THE SAME ORDER as the list above. Each object:
{
  "industry": "short vertical label",
  "description": "1-2 sentence description (fill if null, else keep existing)",
  "audienceDescription": "who the audience is (fill if null)",
  "audienceSize": integer estimate or null,
  "relevancyScore": 0-100 integer,
  "relevancyRationale": "1-2 sentences explaining the score",
  "suggestedAction": "ATTEND" | "APPLY_TO_SPEAK" | "BOTH",
  "category": "ATTEND" | "PARTICIPATE" | "SPEAK",   // top-level track. SPEAK = realistic personal speaking slot (suggestedAction APPLY_TO_SPEAK/BOTH). PARTICIPATE = attended in the employer role, or the employer sponsors or exhibits, or the audience is that employer's customers and partners — only when the profile describes an employer angle. ATTEND = individual attendance, no employer or speaking angle.
  "audienceSignals": ["DEVELOPERS" | "ENGINEERS" | "CUSTOMERS" | "ENTREPRENEURS" | "SMBS" | "PROFESSIONALS" | "WOMEN_IN_TECH" | "PARTNERS"],   // every tag that clearly applies
  "applyUrl": "direct verified URL for speaker application or attendee registration, null if not found",
  "ticketCost": "attendance/ticket price if published (e.g. 'Free', '~€1,995', 'From €99'), else null",
  "socialLinks": {
    "linkedin": "verified URL or null",
    "instagram": "verified URL or null",
    "twitter": "verified URL or null",
    "youtube": "verified URL or null",
    "facebook": "verified URL or null"
  }
}

CRITICAL: Only include URLs you actually found via web search. Return null for any URL you are not certain about.`;

    const response = await fetch(messagesUrl(anthropic), {
      method: "POST",
      headers: anthropic.headers,
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 6000,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 15 }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `LLM error: ${err.slice(0, 300)}` }, { status: 502 });
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

    if (results.length === 0)
      return NextResponse.json({ error: "Could not parse LLM analysis response" }, { status: 502 });

    const validActions = ["ATTEND", "APPLY_TO_SPEAK", "BOTH"];
    const validCategories = ["ATTEND", "PARTICIPATE", "SPEAK"];
    const validSignals = ["DEVELOPERS", "ENGINEERS", "CUSTOMERS", "ENTREPRENEURS", "SMBS", "PROFESSIONALS", "WOMEN_IN_TECH", "PARTNERS"];
    let updated = 0;

    for (let i = 0; i < events.length; i++) {
      const ev  = events[i];
      const res = results[i];
      if (!res) continue;

      const score  = res.relevancyScore != null ? Math.min(100, Math.max(0, Number(res.relevancyScore))) : null;
      const action = res.suggestedAction && validActions.includes(res.suggestedAction) ? res.suggestedAction : null;
      const category = res.category && validCategories.includes(res.category) ? res.category : null;
      const signals = Array.isArray(res.audienceSignals)
        ? [...new Set(res.audienceSignals.map((s) => String(s).toUpperCase().replace(/[\s-]+/g, "_")).filter((s) => validSignals.includes(s)))]
        : [];

      // socialLinks: only store if at least one platform has a non-null URL
      const sl = res.socialLinks ?? null;
      const socialLinksStr = sl && Object.values(sl).some(Boolean) ? JSON.stringify(sl) : (ev.socialLinks ?? null);

      const own = ev.opportunities?.[0];

      // Objective enrichment stays on the shared catalogue.
      await db.event.update({
        where: { id: ev.id },
        data: {
          industry:            res.industry            ?? ev.industry,
          description:         ev.description          ?? res.description ?? null,
          audienceDescription: ev.audienceDescription  ?? res.audienceDescription ?? null,
          audienceSize:        ev.audienceSize          ?? (res.audienceSize != null ? Number(res.audienceSize) : null),
          applyUrl:            res.applyUrl            ?? ev.applyUrl,
          ticketCost:          ev.ticketCost           ?? res.ticketCost ?? null,
          audienceSignals:     ev.audienceSignals      ?? (signals.length ? JSON.stringify(signals) : null),
          socialLinks:         socialLinksStr,
        },
      });

      // The judgement is this speaker's.
      const personal = {
        relevancyScore:     score  ?? own?.relevancyScore     ?? null,
        relevancyRationale: res.relevancyRationale ?? own?.relevancyRationale ?? null,
        suggestedAction:    action ?? own?.suggestedAction    ?? null,
        category:           own?.category ?? category ?? null,
      };
      await db.eventOpportunity.upsert({
        where: { userId_eventId: { userId: session.userId, eventId: ev.id } },
        create: { userId: session.userId, eventId: ev.id, ...personal },
        update: personal,
      });

      updated++;
    }

    return NextResponse.json({
      ok: true,
      analyzed: events.length,
      updated,
      message: `Analyzed ${events.length} events, updated ${updated}`,
    });

  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error("Analyze error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
