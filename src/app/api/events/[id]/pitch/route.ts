import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const event = await db.event.findUnique({
      where: { id },
      include: { partner: true },
    });
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // ── Build contextual intel block ──
    const intelLines: string[] = [];
    if (event.audienceDescription)
      intelLines.push(`- Audience: ${event.audienceDescription}${event.audienceSize ? ` (est. ${event.audienceSize.toLocaleString()} people)` : ""}`);
    else if (event.audienceSize)
      intelLines.push(`- Audience size: est. ${event.audienceSize.toLocaleString()} people`);
    if (event.otherSpeakers)
      intelLines.push(`- Other/past speakers: ${event.otherSpeakers}`);
    if (event.isPaid === true)
      intelLines.push(`- Payment: Paid${event.paidNote ? ` — ${event.paidNote}` : ""}`);
    else if (event.isPaid === false)
      intelLines.push(`- Payment: Unpaid${event.paidNote ? ` — ${event.paidNote}` : ""}`);
    if (event.howToApply)
      intelLines.push(`- How to apply: ${event.howToApply}`);
    const intelBlock = intelLines.length > 0 ? "\n" + intelLines.join("\n") : "";

    const isCoderAngle = event.coderRelevant || !!event.partner;
    let prompt: string;

    if (isCoderAngle) {
      const partnerNote = event.partner
        ? ` This event is associated with ${event.partner.name} (${event.partner.category} partner).`
        : "";
      prompt = `You are Irmak Eyiceoglu, EMEA Partner Manager at Coder (coder.com — self-hosted cloud development environments and AI dev infrastructure; recently raised $90M Series C led by KKR).${partnerNote}

Write a warm, specific, professional speaker application for the following event:
- Event: ${event.title}
- Type: ${event.type}
- Location: ${event.location ?? (event.isOnline ? "Online" : "TBD")}
- Date: ${event.startDate ? new Date(event.startDate).toDateString() : "TBD"}
- Description: ${event.description ?? "N/A"}
- Contact: ${event.contact ?? "N/A"}${intelBlock}

The application should:
1. Start with a clear subject line (format: "Subject: [subject here]")
2. Open with a warm, specific reference to the event and its audience
3. Introduce Irmak as EMEA Partner Manager at Coder, connecting enterprise AI, agentic coding infrastructure, and partner ecosystem themes to the specific audience described above
4. If other speakers are listed, subtly acknowledge the event's pedigree
5. Propose a concrete talk topic that would resonate with this specific audience
6. Be 150-200 words in the body
7. End with a clear call to action referencing how to apply if known

Return ONLY the application text (subject line + body), no preamble.`;
    } else {
      prompt = `You are Irmak Eyiceoglu, independent speaker on Sovereign AI and practical AI for non-technical founders. Credentials: speaker at Nomad Cruise 17 AI Edition (Atlantic crossing, September 2026, 150 founders & digital nomads aboard Queen Mary 2); based in Amsterdam, speaking across EMEA and remotely.

Write a warm, specific, professional speaker application for the following event:
- Event: ${event.title}
- Type: ${event.type}
- Location: ${event.location ?? (event.isOnline ? "Online" : "TBD")}
- Date: ${event.startDate ? new Date(event.startDate).toDateString() : "TBD"}
- Description: ${event.description ?? "N/A"}
- Contact: ${event.contact ?? "N/A"}${intelBlock}

The application should:
1. Start with a clear subject line (format: "Subject: [subject here]")
2. Open with a warm, specific reference to the event and its audience
3. Introduce Irmak as a Sovereign AI expert and practical AI advocate for founders
4. Reference Nomad Cruise 17 as a speaking credential — and calibrate the tone to the audience size/type if known
5. If other speakers are listed, acknowledge the event's quality
6. Propose a specific talk topic (Sovereign AI, practical AI tools, AI for non-technical founders) tailored to the described audience
7. Be 150-200 words in the body
8. End with a clear call to action

Return ONLY the application text (subject line + body), no preamble.`;
    }

    const baseUrl   = process.env.ANTHROPIC_BASE_URL;
    const authToken = process.env.ANTHROPIC_AUTH_TOKEN;

    if (!baseUrl || !authToken) {
      return NextResponse.json({ error: "Anthropic credentials not configured" }, { status: 503 });
    }

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

    const updated = await db.event.update({
      where: { id },
      data: { pitchDraft },
    });

    return NextResponse.json({ pitchDraft: updated.pitchDraft });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Pitch generation error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
