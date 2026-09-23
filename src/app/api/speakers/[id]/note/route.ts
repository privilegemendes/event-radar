import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAnthropic, messagesUrl } from "@/lib/anthropic";
import { requireAdmin, authErrorResponse } from "@/lib/session";
import { capNote } from "@/lib/text";
import { getApplicantProfile } from "@/lib/settings";
import { buildSpeakerProfile, speakerName } from "@/lib/speaker-brief";

export const maxDuration = 120;

/* Regenerate a personal, CREATIVE LinkedIn connection note for one speaker.
   It must NOT ask for anything (no advice, no meeting, no opportunity) — just a genuine personal note.
   body.tone (optional): "warm" | "witty" | "thoughtful" — varies the style. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as { tone?: string };
    const tone = ["warm", "witty", "thoughtful"].includes(body.tone ?? "") ? body.tone! : "warm";

    const speaker = await db.speaker.findUnique({ where: { id } });
    if (!speaker) return NextResponse.json({ error: "Speaker not found" }, { status: 404 });

    const anthropic = resolveAnthropic(process.env);
    if (!anthropic)
      return NextResponse.json({ error: "Anthropic credentials not configured" }, { status: 503 });

    const events: Array<{ title: string }> = speaker.eventsJson ? JSON.parse(speaker.eventsJson) : [];
    const toneHint = tone === "witty"
      ? "Make it a little witty and clever, but still classy."
      : tone === "thoughtful"
      ? "Make it thoughtful and sincere."
      : "Make it warm and genuine.";

    const profile = await getApplicantProfile(session.userId);
    const speakerBlock = buildSpeakerProfile(profile, "compact");
    const name = speakerName(profile);

    const prompt = `${speakerBlock}

Write ONE personal, CREATIVE LinkedIn connection-request note (STRICTLY under 280 characters) from ${name} to this person:
- Name: ${speaker.name}
- Role: ${speaker.title ?? "?"}${speaker.company ? " at " + speaker.company : ""}
- Background: ${speaker.background ?? "?"}
- Speaks about: ${speaker.topics ?? "?"}
- Seen speaking at: ${events.map((e) => e.title).join(", ") || "an AI event"}

Reference something genuinely specific about them and make it land — memorable and human. ${toneHint}
CRITICAL: do NOT ask for anything — no advice, no meeting, no call, no opportunity, no favour, no question. It is simply a genuine personal note that makes them want to accept the connection. First person as ${name}. No emojis, no hashtags, not salesy. Return ONLY the note text, nothing else.`;

    const response = await fetch(messagesUrl(anthropic), {
      method: "POST",
      headers: anthropic.headers,
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `LLM error: ${err.slice(0, 200)}` }, { status: 502 });
    }

    const data = await response.json() as { content: Array<{ type: string; text?: string }> };
    let note = data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join(" ").trim();
    note = capNote(note.replace(/^["'\s]+|["'\s]+$/g, ""));

    const updated = await db.speaker.update({ where: { id }, data: { outreachNote: note } });
    return NextResponse.json({ ok: true, outreachNote: updated.outreachNote });
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
