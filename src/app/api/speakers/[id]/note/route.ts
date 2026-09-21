import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { capNote } from "@/lib/text";

export const maxDuration = 120;

const SPEAKER_PROFILE = `Irmak Eyiceoglu — first-time speaker building a track record. EMEA Partner Manager at Coder (AI devtools). Signature topic: Sovereign AI and practical AI for non-technical founders/entrepreneurs. Confirmed speaker at Nomad Cruise 17 AI Edition (Sept 2026).`;

/* Regenerate a personal, CREATIVE LinkedIn connection note for one speaker.
   It must NOT ask for anything (no advice, no meeting, no opportunity) — just a genuine personal note.
   body.tone (optional): "warm" | "witty" | "thoughtful" — varies the style. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const body = await request.json().catch(() => ({})) as { tone?: string };
    const tone = ["warm", "witty", "thoughtful"].includes(body.tone ?? "") ? body.tone! : "warm";

    const speaker = await db.speaker.findUnique({ where: { id } });
    if (!speaker) return NextResponse.json({ error: "Speaker not found" }, { status: 404 });

    const baseUrl = process.env.ANTHROPIC_BASE_URL;
    const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
    if (!baseUrl || !authToken)
      return NextResponse.json({ error: "Anthropic credentials not configured" }, { status: 503 });

    const events: Array<{ title: string }> = speaker.eventsJson ? JSON.parse(speaker.eventsJson) : [];
    const toneHint = tone === "witty"
      ? "Make it a little witty and clever, but still classy."
      : tone === "thoughtful"
      ? "Make it thoughtful and sincere."
      : "Make it warm and genuine.";

    const prompt = `${SPEAKER_PROFILE}

Write ONE personal, CREATIVE LinkedIn connection-request note (STRICTLY under 280 characters) from Irmak to this person:
- Name: ${speaker.name}
- Role: ${speaker.title ?? "?"}${speaker.company ? " at " + speaker.company : ""}
- Background: ${speaker.background ?? "?"}
- Speaks about: ${speaker.topics ?? "?"}
- Seen speaking at: ${events.map((e) => e.title).join(", ") || "an AI event"}

Reference something genuinely specific about them and make it land — memorable and human. ${toneHint}
CRITICAL: do NOT ask for anything — no advice, no meeting, no call, no opportunity, no favour, no question. It is simply a genuine personal note that makes them want to accept the connection. First person as Irmak. No emojis, no hashtags, not salesy. Return ONLY the note text, nothing else.`;

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
    if (err instanceof Error && err.message === "Not authenticated")
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
