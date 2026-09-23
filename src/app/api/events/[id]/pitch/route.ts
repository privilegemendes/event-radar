import { NextRequest, NextResponse } from "next/server";
import { resolveAnthropic, messagesUrl } from "@/lib/anthropic";
import { buildPitchPrompt, savePitchDraft } from "@/lib/pitch";
import { requireSession, authErrorResponse } from "@/lib/session";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    /* Any signed-in speaker: the upsert below writes only session.userId's own
       opportunity row, and a speaker who cannot draft their own application has
       no use for the rest of the app. Same reasoning as scoring. */
    const session = await requireSession();

    const { id } = await params;
    const built = await buildPitchPrompt(session.userId, id);
    if (!built) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { prompt } = built;

    const anthropic = resolveAnthropic(process.env);

    if (!anthropic) {
      return NextResponse.json({ error: "Anthropic credentials not configured" }, { status: 503 });
    }

    const response = await fetch(messagesUrl(anthropic), {
      method: "POST",
      headers: anthropic.headers,
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic error:", err);
      return NextResponse.json({ error: "LLM request failed" }, { status: 502 });
    }

    const data = await response.json() as {
      content: Array<{ type: string; text?: string }>;
    };
    const pitchDraft = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n");

    const saved = await savePitchDraft(session.userId, id, pitchDraft);
    return NextResponse.json({ pitchDraft: saved });
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error("Pitch generation error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
