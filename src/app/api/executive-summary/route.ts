import { NextResponse } from "next/server";
import { resolveAnthropic, messagesUrl } from "@/lib/anthropic";
import { requireSession, authErrorResponse, type Session } from "@/lib/session";
import { buildSummaryBrief, saveSummary, readSummary, computeStats } from "@/lib/executive-summary";
import { isOwner } from "@/lib/owner";

export const maxDuration = 120;

/**
 * Where a speaker's generated summary is cached.
 *
 * Per user. computeStats has been per-speaker since Phase 2, but the generated
 * text was written to a single global AppSetting row, so the page showed your
 * numbers above whoever last pressed Generate — two different people on one
 * screen with nothing saying so.
 *
 * The old un-suffixed "exec_summary" row is left where it is rather than
 * migrated onto one person: it was written from whichever speaker happened to
 * generate last, and assigning it to someone would be a guess. Nothing reads it
 * now, and a summary is regenerated in one click.
 */
export async function GET() {
  let session: Session;
  try {
    session = await requireSession();
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    throw err;
  }

  const stats = await computeStats(session.userId, isOwner(session));
  const { summary, generatedAt } = await readSummary(session.userId);
  return NextResponse.json({ stats, summary, generatedAt });
}

export async function POST() {
  /* This route needs the session itself (for isOwner) and has no try/catch of
     its own, so the guard is wrapped rather than the whole handler.

     requireSession, not requireAdmin: the summary is per speaker end to end —
     computeStats reads the caller's own opportunities, the brief is their own
     profile, and it is stored under a key scoped to their user id. Generation
     therefore touches nobody else's data, and an admin-only gate left a MEMBER
     staring at "No summary generated yet" with no way to generate one. */
  let session: Session;
  try {
    session = await requireSession();
  } catch (err) {
    const authed = authErrorResponse(err);
    if (authed) return authed;
    throw err;
  }

  const { brief, stats } = await buildSummaryBrief(session.userId, isOwner(session));
  const anthropic = resolveAnthropic(process.env);
  if (!anthropic) return NextResponse.json({ error: "LLM not configured" }, { status: 503 });


  const res = await fetch(messagesUrl(anthropic), {
    method: "POST",
    headers: anthropic.headers,
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 3000, messages: [{ role: "user", content: brief }] }),
  });
  if (!res.ok) return NextResponse.json({ error: `LLM error: ${(await res.text()).slice(0, 200)}` }, { status: 502 });
  const data = await res.json() as { content: Array<{ type: string; text?: string }> };
  const md = data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();

  const now = await saveSummary(session.userId, md);
  return NextResponse.json({ ok: true, summary: md, generatedAt: now, stats });
}
