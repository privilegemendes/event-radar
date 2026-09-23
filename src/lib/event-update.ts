import { db } from "@/lib/db";
import { serializeAudienceSignals } from "@/lib/events";
import { mergeEventWithOpportunity, splitEventUpdate } from "@/lib/opportunity";

export type UpdateEventResult =
  | { ok: true; event: Record<string, unknown> }
  | { ok: false; status: 403 | 404; error: string };

/**
 * Apply a partial update to one event, as this speaker.
 *
 * The whole operation rather than its parts, for the reason set out in
 * event-list.ts: the HTTP route and the MCP tool both need it, and sharing
 * only the primitives is how the two drifted last time. A caller supplies a
 * flat body and receives the merged row back; it does not get to decide what a
 * non-admin may write.
 *
 * The body is flat — objective fields and this speaker's fields together, the
 * same shape reads return — so it is split before anything is written:
 * catalogue columns to Event, personal ones to this speaker's own
 * EventOpportunity row.
 *
 * AUTHORITY. A non-admin may move an event through review and track their own
 * preparation, nothing else: every catalogue field is dropped and the status is
 * limited to DISCOVERED, APPROVED or REJECTED. Because all of it lands on their
 * OWN opportunity row, a reviewer cannot change what another speaker sees.
 */
export async function updateEventForSpeaker(
  userId: string,
  isAdmin: boolean,
  id: string,
  body: Record<string, unknown>,
): Promise<UpdateEventResult> {
  /* Confirm the event exists before writing anything. Without this the
     opportunity upsert violates its foreign key and throws, which the route
     turned into a 500 — an unknown id is a 404, and a tool caller needs to be
     told which it was rather than shown a server error. */
  const exists = await db.event.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return { ok: false, status: 404, error: `No event with id ${id}` };

  /* Partial update. The body is flat — objective fields and this speaker's
     fields together, the same shape reads return — so it is split before
     anything is written: catalogue columns to Event, personal ones to this
     speaker's own EventOpportunity row. */
  const { eventData: rawEvent, opportunityData: rawOpportunity } = splitEventUpdate(body);

  const eventData: Record<string, unknown> = {};
  const strFields = ["title", "location", "region", "url", "contact", "description",
    "sourceNote", "partnerId", "paidNote", "ticketCost", "audienceDescription",
    "otherSpeakers", "howToApply", "industry", "type",
    "applyUrl", "attendUrl", "socialLinks"];  // socialLinks is stored as JSON string
  for (const f of strFields) if (f in rawEvent) eventData[f] = rawEvent[f] ?? null;
  if ("audienceSignals" in rawEvent) {
    eventData.audienceSignals = Array.isArray(rawEvent.audienceSignals)
      ? serializeAudienceSignals(rawEvent.audienceSignals as string[])
      : (rawEvent.audienceSignals ?? null);
  }
  if ("startDate" in rawEvent)   eventData.startDate   = rawEvent.startDate   ? new Date(rawEvent.startDate as string)   : null;
  if ("endDate" in rawEvent)     eventData.endDate     = rawEvent.endDate     ? new Date(rawEvent.endDate as string)     : null;
  if ("cfpDeadline" in rawEvent) eventData.cfpDeadline = rawEvent.cfpDeadline ? new Date(rawEvent.cfpDeadline as string) : null;
  if ("isOnline" in rawEvent)      eventData.isOnline      = Boolean(rawEvent.isOnline);
  if ("isCoderEvent" in rawEvent)  eventData.isCoderEvent  = Boolean(rawEvent.isCoderEvent);
  if ("isPaid" in rawEvent)        eventData.isPaid        = rawEvent.isPaid == null ? null : Boolean(rawEvent.isPaid);
  if ("audienceSize" in rawEvent)  eventData.audienceSize  = rawEvent.audienceSize != null ? Number(rawEvent.audienceSize) : null;

  const opportunityData: Record<string, unknown> = {};
  for (const f of ["relevancyRationale", "acceptanceLikelihood", "acceptanceRationale",
                   "suggestedAction", "category", "status", "pitchDraft",
                   "readiness", "prepStage", "customTasks"]) {
    if (f in rawOpportunity) opportunityData[f] = rawOpportunity[f] ?? null;
  }
  if ("followUpAt" in rawOpportunity)      opportunityData.followUpAt      = rawOpportunity.followUpAt ? new Date(rawOpportunity.followUpAt as string) : null;
  if ("attending" in rawOpportunity)       opportunityData.attending       = Boolean(rawOpportunity.attending);
  if ("employerRelevant" in rawOpportunity) opportunityData.employerRelevant = Boolean(rawOpportunity.employerRelevant);
  if ("private" in rawOpportunity)         opportunityData.private         = Boolean(rawOpportunity.private);
  if ("relevancyScore" in rawOpportunity)  opportunityData.relevancyScore  = rawOpportunity.relevancyScore != null ? Number(rawOpportunity.relevancyScore) : null;

  /* A non-admin may only move an event through review and track their own
     preparation. Everything else is stripped — and note all of it now lands
     on their OWN opportunity row, so a reviewer can no longer change what
     another speaker sees. */
  if (!isAdmin) {
    const reviewerFields = new Set(["status", "attending", "readiness", "prepStage", "customTasks", "followUpAt"]);
    for (const k of Object.keys(opportunityData)) if (!reviewerFields.has(k)) delete opportunityData[k];
    for (const k of Object.keys(eventData)) delete eventData[k];
    if (typeof opportunityData.status === "string" && !["DISCOVERED", "APPROVED", "REJECTED"].includes(opportunityData.status)) {
      return { ok: false, status: 403, error: "Reviewers can only approve or reject events" };
    }
    if (Object.keys(opportunityData).length === 0) {
      return { ok: false, status: 403, error: "A reviewer can only set status, attending, readiness, prepStage, customTasks or followUpAt" };
    }
  }

  if (Object.keys(eventData).length) {
    await db.event.update({ where: { id }, data: eventData });
  }
  if (Object.keys(opportunityData).length) {
    await db.eventOpportunity.upsert({
      where: { userId_eventId: { userId: userId, eventId: id } },
      create: { userId: userId, eventId: id, ...opportunityData },
      update: opportunityData,
    });
  }

  const updated = await db.event.findUnique({
    where: { id },
    include: {
      partner: { select: { id: true, name: true } },
      opportunities: { where: { userId: userId }, take: 1 },
    },
  });
  if (!updated) return { ok: false, status: 404, error: `No event with id ${id}` };
  return { ok: true, event: mergeEventWithOpportunity(updated as Record<string, unknown>, updated.opportunities[0]) as Record<string, unknown> };
}
