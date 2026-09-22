# Per-speaker workspaces ("Track B")

Living plan for supporting more than one speaker over one shared event catalog.
Phase 0 has landed; the rest is scoped but unbuilt.

## The problem

The app was built for one speaker. Every event row stores *what Irmak thinks of
it* — score, track, pipeline position, draft pitch — alongside what the event
objectively *is*. A second speaker cannot have their own opinion of an event
without overwriting hers.

`role` compounds this: ADMIN means "can operate the app", but because there is
one speaker identity, operating it also means being able to act *as* Irmak —
rewrite her brief, generate pitches signed with her name. Identity and
permission are the same axis when they should be independent.

## Three axes

| Axis | Example | Belongs on |
|---|---|---|
| The event | KubeCon, March, Amsterdam, €900 | `Event` — shared |
| The speaker | score 25, ATTEND, LOW, not applied | `EventOpportunity` — per person |
| The employer | `isCoderEvent`, partner link | stays on `Event`, owner-gated (deferred) |

## Target schema

```
User ──1:1── SpeakerProfile
  └──1:N── EventOpportunity ──N:1── Event
              unique(userId, eventId)
```

`Event` keeps the objective facts. `EventOpportunity` takes `relevancyScore`,
`relevancyRationale`, `acceptanceLikelihood`, `acceptanceRationale`,
`suggestedAction`, `category`, `status`, `attending`, `readiness`, `prepStage`,
`customTasks`, `pitchDraft`, `followUpAt`, and `coderRelevant` renamed to
`employerRelevant` (it is derived from *that speaker's* `employerAngle`).

**`ownerOnly` disappears.** Privacy falls out of per-speaker opportunities: the
five nomad events are simply Irmak's. `OWNER_EMAIL` and its six `isOwner()`
call sites go with it.

## Phases

Expand / migrate / contract. Each ships independently; nothing breaks between.

| Phase | What | Reversible |
|---|---|---|
| **0 — DONE** | `SpeakerProfile` table; brief moves out of `AppSetting` JSON. No `Event` changes; accessors still resolve the owner, so behaviour is unchanged. | Yes |
| **1 — DONE (local)** | `EventOpportunity` added and backfilled. `Event` columns stay authoritative; nothing reads the new table yet. Two renames land here: `coderRelevant` → `employerRelevant` (it follows the speaker's own `employerAngle`) and `ownerOnly` → `private`. | Yes |
| **2 — DONE** | Reads and writes scoped to the session user. Smaller than feared: the API keeps returning the **flat** shape `EventLike` already expects, so pages, components and ranking helpers were untouched — the change is six API routes plus discovery. | Yes (revert code) |
| 3 | Drop the moved columns from `Event`. | **No** |
| 4 | Split discovery (below). | Yes |

Phase 3 is the only irreversible step and can wait well after Phase 2 proves out.

**Do not run the backfill when Phase 1 deploys.** It has no consumer until
Phase 2 switches the reads, and it goes stale the moment anyone uses the app —
observed in practice: 298 events were re-triaged in production within an hour of
a snapshot, and a copy taken beforehand would have silently missed all of them.

Run `scripts/backfill-event-opportunities.ts --write --refresh` as the **first
step of the Phase 2 deploy**, against current data, immediately before the reads
flip. One run, no window for drift.

The existing scores are **Irmak's** — computed against her FIRST_TIME rubric and
her topics. They are attributed to her opportunity rows, not discarded.

## Onboarding a new speaker: score upcoming, in the background

A new speaker sees the full catalog with an empty pipeline — the events are
visible, but nothing is scored, tracked or ranked for them until their scoring
pass runs.

Scoring everything on join would be ~62 batched LLM calls over ~1,229 relevant
rows, per speaker. Instead:

- **Upcoming only.** Of 1,326 events, 681 are upcoming and 548 are undated
  recurring meetups/podcasts; 97 are past and never worth scoring.
- **Background, soonest first**, so a useful ranked view appears within a minute
  or two rather than after one long blocking pass.

## Discovery must split

Today one call finds *and* scores: 16k tokens with up to 10 web searches. N
speakers would multiply that weekly.

| Pass | Cost | Who |
|---|---|---|
| Shared catalog discovery — web search | Expensive | **ADMIN** |
| Per-speaker scoring — no web search, event facts + that brief | Cheap | **MEMBER**, for themselves |

That boundary happens to match the role boundary exactly.

## Deferred: the employer axis

`isCoderEvent`, `partnerId`, the `Partner` CRM and `/coder-events` stay as they
are, gated to the owner. A second speaker simply does not see them, and their
PARTICIPATE track is driven only by their own `employerAngle`.

Building `Organization` / `OrganizationMember` now roughly doubles the work to
serve a user who does not exist. When a second Coder person needs the partner
list it is a contained migration — 95 rows and a foreign key.

Note the Neon database also carries an unused `neon_auth` schema which already
contains `organization` / `member` / `invitation` tables. That is Neon's managed
Better Auth offering, provisioned and empty. It is **not** what this app uses.

## Settled along the way

- **Reads require a login.** The public-read model was an artefact of the Coder
  proxy and did not survive a public URL. Every page redirects and every `GET`
  answers 401.
- **Discovery creates an opportunity per speaker profile**, so a new event lands
  in every speaker's inbox.
- **The wire keeps the old names** `coderRelevant` and `ownerOnly`, mapping to
  `employerRelevant` and `private` in storage. Renaming the wire is cosmetic and
  would touch every consumer; the schema enforces the split regardless.

## Open decisions

1. Pitch generation and outreach notes for MEMBERs — allowed, accepting
   per-member LLM spend, or admin-gated? Currently admin-gated.
2. Phase 4 matters more now: discovery gives **every** speaker the same score,
   computed against whichever brief that pass ran with. Wrong for everyone but
   that speaker, and only the shared-find / per-speaker-score split fixes it.
