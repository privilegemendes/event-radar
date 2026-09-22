import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, authErrorResponse } from "@/lib/session";
import { capNote } from "@/lib/text";
import { getApplicantProfile } from "@/lib/settings";
import { buildSpeakerProfile, speakerName, parseList } from "@/lib/speaker-brief";

export const maxDuration = 300;

/* ── Robust JSON-array extractor (shared pattern) ── */
function extractJsonArray(text: string): unknown[] | null {
  const tryParse = (s: string): unknown[] | null => {
    try { const p = JSON.parse(s); return Array.isArray(p) ? p : null; } catch { return null; }
  };
  const isObjArray = (a: unknown[]) => a.some((x) => x && typeof x === "object" && !Array.isArray(x));
  let p = tryParse(text.trim()); if (p) return p;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { p = tryParse(fence[1].trim()); if (p && isObjArray(p)) return p; }
  const candidates: unknown[][] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "[") continue;
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "[") depth++;
      else if (c === "]") { depth--; if (depth === 0) { const arr = tryParse(text.slice(i, j + 1)); if (arr) candidates.push(arr); i = j; break; } }
    }
  }
  const objArrays = candidates.filter(isObjArray).sort((a, b) => b.length - a.length);
  if (objArrays.length) return objArrays[0];
  const start = text.indexOf("[");
  if (start !== -1) {
    const tail = text.slice(start);
    const lb = tail.lastIndexOf("}");
    if (lb !== -1) { p = tryParse(tail.slice(0, lb + 1) + "]"); if (p) return p; }
  }
  return candidates.sort((a, b) => b.length - a.length)[0] ?? null;
}

type RawSpeaker = {
  name?: string;
  title?: string | null;
  company?: string | null;
  linkedinUrl?: string | null;
  background?: string | null;
  topics?: string | null;
  region?: string | null;
  eventTitle?: string | null;
  outreachNote?: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin();
    const body = await request.json().catch(() => ({})) as { eventIds?: string[] };
    const today = new Date();
    const todayStart = new Date(today.toDateString());

    // Pick events to mine for announced speakers: explicit ids, else the most
    // relevant upcoming CONFERENCES/summits first (big events publish speaker lineups;
    // tiny soonest webinars usually don't), then by soonest date.
    const events = body.eventIds?.length
      ? await db.event.findMany({ where: { id: { in: body.eventIds } }, select: { id: true, title: true, startDate: true, location: true, url: true, region: true, otherSpeakers: true } })
      : await db.event.findMany({
          where: {
            status: { not: "REJECTED" },
            type: { in: ["CONFERENCE", "EVENT", "MEETUP"] },
            startDate: { gte: todayStart },
          },
          select: { id: true, title: true, startDate: true, location: true, url: true, region: true, otherSpeakers: true },
          orderBy: [{ relevancyScore: { sort: "desc", nulls: "last" } }, { startDate: "asc" }],
          take: 15,
        });

    if (events.length === 0)
      return NextResponse.json({ ok: true, found: 0, message: "No upcoming events to mine for speakers" });

    const baseUrl = process.env.ANTHROPIC_BASE_URL;
    const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
    if (!baseUrl || !authToken)
      return NextResponse.json({ error: "Anthropic credentials not configured" }, { status: 503 });

    const eventList = events.map((e, i) =>
      `#${i + 1}: "${e.title}" | ${e.location ?? (e.region ?? "location?")} | ${e.startDate ? new Date(e.startDate).toISOString().slice(0, 10) : "date?"} | ${e.url ?? "no url"}${e.otherSpeakers ? ` | known: ${e.otherSpeakers}` : ""}`
    ).join("\n");

    const profile = await getApplicantProfile(session.userId);
    const speakerBlock = buildSpeakerProfile(profile, "outreach");
    const name = speakerName(profile);
    const topics = parseList(profile.signatureTopics);
    const topicLine = topics.length ? topics.join(", ") : "the event's subject area";

    const prompt = `${speakerBlock}

Use web search to find the ANNOUNCED / CONFIRMED / PAST speakers for the events below (check the event's official speakers page, agenda, and LinkedIn). For each event, return up to 4 of the most relevant speakers — prioritise those who speak about ${topicLine}, or who are frequent conference speakers (people ${name} could learn from or approach).

For EACH speaker, also research (via web search):
- their current job title and company,
- their LinkedIn profile URL (only if you actually find it — else null),
- a one-sentence background (why they're notable / what they speak about),
- the topics they speak on,
- and write a warm, authentic, CREATIVE, personalised LinkedIn connection note (under 280 characters) FROM ${name} TO that speaker. Reference something genuinely specific about them, their talk, or their work, and make it land — memorable, human, and a little clever. IMPORTANT: do NOT ask for anything (no advice, no meeting, no call, no opportunity, no favour) — it is purely a genuine personal note that makes them want to accept the connection. First person as ${name}. No emojis, no hashtags, not salesy.

Events:
${eventList}

Return ONLY a flat JSON array (no markdown, no prose). One object per speaker (a speaker appearing at multiple listed events can appear once with the most relevant eventTitle):
[{
  "name": "Full Name",
  "title": "job title or null",
  "company": "company or null",
  "linkedinUrl": "https://www.linkedin.com/in/... or null",
  "background": "one sentence or null",
  "topics": "comma-separated topics or null",
  "region": "Amsterdam/NL | Rest of Europe | London/UK | Austin | Bay Area | Online | Other or null",
  "eventTitle": "the event where they are announced (use the exact title from the list)",
  "outreachNote": "personalised LinkedIn note under 280 chars, first person as ${name}"
}]
Only include real people you found via search. Do not invent names or LinkedIn URLs.`;

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
        Authorization: `Bearer ${authToken}`,
        "x-api-key": authToken,
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 16000,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 12 }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `LLM error: ${err.slice(0, 300)}` }, { status: 502 });
    }

    const data = await response.json() as { content: Array<{ type: string; text?: string }> };
    const text = data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
    const raw = extractJsonArray(text);
    if (!raw) return NextResponse.json({ ok: true, created: 0, updated: 0, candidates: 0, eventsMined: events.length, note: "No announced speakers found for the mined events" });

    const speakers = raw as RawSpeaker[];
    const titleToEvent = new Map(events.map((e) => [e.title.toLowerCase(), e]));
    const sourceNote = `Speaker discovery — ${today.toDateString()}`;
    let created = 0, updated = 0;

    for (const s of speakers) {
      if (!s.name || typeof s.name !== "string") continue;
      const name = s.name.trim();
      if (name.length < 2) continue;

      // Resolve the linked event (best-effort by title match).
      const evt = s.eventTitle ? titleToEvent.get(s.eventTitle.toLowerCase()) : undefined;
      const evtRef = evt ? { id: evt.id, title: evt.title, startDate: evt.startDate } : null;

      const existing = await db.speaker.findFirst({ where: { name } });
      if (existing) {
        const evList: Array<{ id: string; title: string; startDate: Date | null }> =
          existing.eventsJson ? JSON.parse(existing.eventsJson) : [];
        let changed = false;
        if (evtRef && !evList.some((x) => x.id === evtRef.id)) { evList.push(evtRef); changed = true; }
        await db.speaker.update({
          where: { id: existing.id },
          data: {
            title:       existing.title ?? s.title ?? null,
            company:     existing.company ?? s.company ?? null,
            linkedinUrl: existing.linkedinUrl ?? s.linkedinUrl ?? null,
            background:  existing.background ?? s.background ?? null,
            topics:      existing.topics ?? s.topics ?? null,
            region:      existing.region ?? s.region ?? null,
            outreachNote: existing.outreachNote ?? (s.outreachNote ? capNote(s.outreachNote) : null),
            eventsJson:  JSON.stringify(evList),
            talkCount:   evList.length,
          },
        });
        if (changed) updated++;
      } else {
        const evList = evtRef ? [evtRef] : [];
        await db.speaker.create({
          data: {
            name,
            title:       s.title ?? null,
            company:     s.company ?? null,
            linkedinUrl: s.linkedinUrl ?? null,
            background:  s.background ?? null,
            topics:      s.topics ?? null,
            region:      s.region ?? null,
            outreachNote: s.outreachNote ? capNote(s.outreachNote) : null,
            eventsJson:  JSON.stringify(evList),
            talkCount:   evList.length || 1,
            sourceNote,
          },
        });
        created++;
      }
    }

    return NextResponse.json({ ok: true, created, updated, candidates: speakers.length, eventsMined: events.length });
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error("Speaker discovery error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
