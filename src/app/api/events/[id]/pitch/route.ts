import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, authErrorResponse } from "@/lib/session";
import { getApplicantProfile } from "@/lib/settings";
import { speakerName, parseList, parsePronouns } from "@/lib/speaker-brief";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();

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

    const profile = await getApplicantProfile();
    const name = speakerName(profile);
    const employerAngle = (profile.employerAngle ?? "").trim();
    const credentials = parseList(profile.credentials);
    const topics = parseList(profile.signatureTopics);
    const pronouns = parsePronouns(profile.pronouns);
    const location = (profile.location ?? "").trim();

    const topicLine = topics.length ? topics.join(", ") : "the event's subject area";
    const credentialLine = credentials.length
      ? `Speaking credentials: ${credentials.join("; ")}.`
      : "";

    /* An employer angle only applies when the profile describes one AND the
       event is actually employer-relevant. With no employer angle configured,
       every pitch is written as an independent speaker. */
    const useEmployerAngle = !!employerAngle && (event.coderRelevant || !!event.partner);

    const eventBlock = `- Event: ${event.title}
- Type: ${event.type}
- Location: ${event.location ?? (event.isOnline ? "Online" : "TBD")}
- Date: ${event.startDate ? new Date(event.startDate).toDateString() : "TBD"}
- Description: ${event.description ?? "N/A"}
- Contact: ${event.contact ?? "N/A"}${intelBlock}`;

    let prompt: string;

    if (useEmployerAngle) {
      const partnerNote = event.partner
        ? ` This event is associated with ${event.partner.name} (${event.partner.category} partner).`
        : "";
      prompt = `You are ${name}. ${employerAngle}${partnerNote}

Write a warm, specific, professional speaker application for the following event:
${eventBlock}

The application should:
1. Start with a clear subject line (format: "Subject: [subject here]")
2. Open with a warm, specific reference to the event and its audience
3. Introduce ${name} using the employer positioning above, connecting it to the specific audience described
4. If other speakers are listed, subtly acknowledge the event's pedigree
5. Propose a concrete talk topic drawn from: ${topicLine} — tailored to this specific audience
6. Be 150-200 words in the body
7. End with a clear call to action referencing how to apply if known

Write in the first person as ${name}. Return ONLY the application text (subject line + body), no preamble.`;
    } else {
      const basedIn = location ? ` Based in ${location}.` : "";
      prompt = `You are ${name}, an independent speaker on ${topicLine}.${basedIn} ${credentialLine}

Write a warm, specific, professional speaker application for the following event:
${eventBlock}

The application should:
1. Start with a clear subject line (format: "Subject: [subject here]")
2. Open with a warm, specific reference to the event and its audience
3. Introduce ${name} as a speaker on ${topicLine}
${credentials.length ? `4. Reference ${credentials[0]} as a speaking credential — calibrate the tone to the audience size/type if known` : "4. Lead with relevant expertise rather than past speaking slots, since none are listed"}
5. If other speakers are listed, acknowledge the event's quality
6. Propose a specific talk topic drawn from: ${topicLine} — tailored to the described audience
7. Be 150-200 words in the body
8. End with a clear call to action

Write in the first person as ${name} (${pronouns.subject}/${pronouns.object}). Return ONLY the application text (subject line + body), no preamble.`;
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

    /* The draft is written in this speaker's voice, from their brief — it
       belongs on their opportunity, not on the shared event where it would be
       served to everyone. */
    const updated = await db.eventOpportunity.upsert({
      where: { userId_eventId: { userId: session.userId, eventId: id } },
      create: { userId: session.userId, eventId: id, pitchDraft },
      update: { pitchDraft },
    });

    return NextResponse.json({ pitchDraft: updated.pitchDraft });
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    console.error("Pitch generation error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
