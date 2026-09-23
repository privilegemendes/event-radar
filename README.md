# Event Radar

Finds conferences, meetups, podcasts and webinars worth speaking at, and ranks
them **for a particular speaker**. Several speakers share one catalogue of
events and each holds their own opinion of it — their own scores, their own
pipeline, their own notes. Nobody sees anyone else's.

Every event falls into one of three tracks: **Speak** (a realistic speaking
slot), **Participate** (attended in an employer's name, if the speaker has an
employer angle) and **Attend** (personal learning and network).

## How the AI works

Three passes, deliberately separate, because finding an event is shareable and
judging it is not.

| Pass | What it does | Web search | Scope | Who |
|---|---|---|---|---|
| **Discovery** | Finds events and records facts — what, when, where, who attends, what it costs | Yes, expensive | Once for everyone | ADMIN |
| **Enrich** (`analyze`) | Fills objective gaps: apply URL, ticket cost, social links | Yes | Once for everyone | ADMIN |
| **Scoring** | Judges each event against one speaker's brief | **No** | Once per speaker | Each speaker, for themselves |

Discovery used to score as well, in the same call. That gave every speaker the
same number — computed against whichever brief the pass happened to run with —
and made a second speaker cost a second web-search bill for events that are
identical for everybody. Scoring is cheap *because* it has no web search: it
judges facts already in the catalogue. If it ever needs a fact that is missing,
enrich the catalogue once rather than giving this pass a search.

Discovery's prompt is built from the **union** of every speaker's topics and
locations, so the catalogue is not shaped around whoever was configured first.

## Features

- **Per-speaker everything** — scores, pipeline status, attendance, readiness
  checklists, pitch drafts and the executive summary all belong to one speaker.
  The events themselves are shared.
- **Three tracks** — SPEAK, PARTICIPATE, ATTEND, each ranked within its track.
- **Scoring rubric that inverts by level** — `FIRST_TIME` scores meetups and
  podcasts highest and mega-conferences lowest; `KEYNOTE` does the opposite. The
  same event is a different number for two people, which is the point.
- **Ranked inbox** — triage queue ordered by the viewer's own score, best first,
  unscored last, past events excluded.
- **Search page** (`/events`) — filter the whole catalogue by type, region, city,
  cost, track, partner and free text.
- **Profile** (`/profile`) — the speaker's own details and brief. Every speaker
  edits their own.
- **Audience signals** — who each event is for (Developers, Engineers, Customers,
  Entrepreneurs, SMBs, Professionals, Women in Tech, Partners).
- **Calendar availability** — an optional read-only ICS feed flags clashes.
- **Apply helper** — one-click copy of the speaker's own details into CFP forms.
- **Pitch generator** — Claude drafts an application in the speaker's own voice,
  citing their own credentials.
- **Executive summary** — Claude reads the shape of that speaker's catalogue and
  recommends where to spend time.
- **Partner CRM** and **partner-scoped discovery**.
- **Calendar and map views**.

## Roles

Login is required for every page and every read.

| | MEMBER | ADMIN |
|---|---|---|
| Browse, search, calendar, map | ✅ | ✅ |
| Own profile and speaker brief | ✅ | ✅ |
| Score the catalogue for themselves | ✅ | ✅ |
| Triage their own inbox, mark attending, readiness | ✅ | ✅ |
| Generate their own pitch and executive summary | ✅ | ✅ |
| Run discovery / enrich (spends money, writes shared rows) | ❌ | ✅ |
| Create, edit or delete an event | ❌ | ✅ |
| Manage users and change roles | ❌ | ✅ |
| Work-calendar ICS settings | ❌ | ✅ |

The rule: **anything that touches only your own row is open to every speaker;
anything shared or costly is ADMIN.** Admins change roles from Settings, and
cannot demote themselves or the last remaining admin.

Sign-up at `/signup` is **open** — anyone who reaches the URL can create a
MEMBER account, and a MEMBER can read the whole catalogue and the partner CRM.
Gate it behind an invite code before putting the URL anywhere public.

## Setup

```bash
npm install
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

The datasource is **PostgreSQL**. For local work, point `DATABASE_URL` at a local
Postgres database; `scripts/copy-prod-to-local.ts` copies production down into it
and refuses any destination that is not localhost.

Run the tests with:

```bash
npm test
```

> Each git worktree reads its own `.env`, but they will happily share one local
> database — a schema reset in any of them wipes it for all. Give each worktree
> its own database if you run more than one.

## Default Logins

> ⚠️ **All seeded passwords are `change-me-now` — change them on first login.**

| Email | Role | Notes |
|-------|------|-------|
| irmak@coder.com | ADMIN | Primary user, and the `OWNER_EMAIL` default |
| assistant@example.com | ADMIN | Secondary admin |
| viewer@coder.com | MEMBER | Non-admin account |

A banner shows until the default password is changed.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | yes | PostgreSQL connection string (pooled) |
| `DATABASE_URL_UNPOOLED` | prod | Direct connection, used by one-off scripts |
| `BETTER_AUTH_SECRET` | yes | Secret Better Auth signs sessions with (32+ chars). Falls back to `SESSION_SECRET`. |
| `BETTER_AUTH_URL` | prod | The app's public URL. **Set it explicitly in production** — otherwise it is inferred from Vercel's vars, and `VERCEL_URL` is per-deployment rather than the stable domain. Locally it defaults to `http://localhost:3000`, so **a dev server on any other port needs this set to match** or sign-in fails with `Invalid origin`. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | multi-domain | Comma-separated hosts Better Auth accepts sign-in from. Required when the project answers on more than one domain. Vercel's per-deployment and branch URLs are added in code. |
| `ANTHROPIC_API_KEY` | AI features | A standard Anthropic key. Alone, it is enough — the base URL defaults to the official API. |
| `ANTHROPIC_AUTH_TOKEN` | gateway only | Legacy name, for a gateway in front of Anthropic. **Takes precedence over `ANTHROPIC_API_KEY` when both are set**, so remove a stale one or the key is ignored. |
| `ANTHROPIC_BASE_URL` | gateway only | Overrides the official API. A gateway also receives an `Authorization: Bearer` header; the official API does not. |
| `OWNER_EMAIL` | no | Owner account — sees the Podium. Defaults to `irmak@coder.com`. |
| `CRON_SECRET` | prod | Locks the cron endpoint. Vercel Cron sends it as `Authorization: Bearer <secret>`. |
| `WORK_CALENDAR_ICS_URL` | no | Read-only calendar feed. A secret: it grants read access to the whole calendar. |

Credential resolution lives in one place, `src/lib/anthropic.ts` — every call
site goes through it, and a test fails if one starts reading the env directly.

## Authentication

Better Auth (self-hosted), email + password only. Passwords stay on **bcrypt**
rather than Better Auth's default scrypt, so existing hashes keep working.

Credentials live in the `account` table, not on the user row. A user created
without one cannot sign in — `POST /api/users` and `scripts/add-admin.ts` both
write the two rows in a single transaction.

Middleware checks only that a session cookie *exists*, and never validates it:
that would mean a database round-trip on nearly every request. Authorization is
enforced server-side in the API routes (`requireSession` / `requireAdmin`) and in
the owner-only Podium layout. `/api/*` is exempt from the redirect so it answers
401 JSON rather than an HTML login page.

### Re-generating the auth schema

`npx @better-auth/cli generate` rewrites `prisma/schema.prisma`. It re-adds
`@@map("user")` to the `User` model every time — **delete it**, or the next
migration renames a populated table.

## Speaker brief

Every prompt sent to Claude is rendered from the speaker's own profile at
**/profile**, not hardcoded. The fields that change AI behaviour:

| Field | Effect |
|-------|--------|
| Speaking level | Selects the scoring rubric, and the bands invert across levels. |
| Signature topics | Searched for, and scored against. |
| Priority locations | Discovery searches each separately; scoring weighs how reachable an event is. |
| Speaking credentials | Cited in generated pitches. Leave blank rather than inventing — it goes to real organisers. |
| Employer angle | Enables the PARTICIPATE track and the employer-framed pitch. Blank = independent speaker. |
| Excluded event types | Dropped from discovery entirely. |
| Private-event keywords | Matching events are hidden from other speakers. |
| Rubric override | Replaces the generated rubric wholesale. |

The builders live in `src/lib/speaker-brief.ts` and are pure functions covered by
`src/lib/speaker-brief.test.ts`.

## Scheduled runs

`POST|GET /api/cron/discovery` has two independent halves:

- **Discovery** runs only when **Settings → Automatic Discovery** is on, and not
  while another run started in the last 10 minutes.
- **Scoring** runs on every invocation regardless, once per speaker.

Turning discovery off therefore stops the web-search spend without stopping the
judging — they used to be one switch, so turning discovery off silently turned
scoring off too.

Vercel's cron is defined in `vercel.json` (Mondays 09:00 UTC). Scoring is serial
across speakers at roughly a minute per 100 events each, against
`maxDuration = 300` — around five speakers is where a run starts being cut off,
and where the batches need to go concurrent.

## Deployment (Vercel)

Deployed from GitHub, auto-deploying on push to `main` with preview deployments
per PR. The database is **Neon** (`eu-central-1`).

Notes worth keeping:

- **Neon auto-suspends.** A cold connection can exceed Prisma's default 10s pool
  timeout and psql's default connect timeout — both report it as though the
  server were unreachable. One-off scripts should raise `connect_timeout` (see
  `scripts/backfill-event-opportunities.ts`).
- **Per-row round-trips are the thing that makes scripts slow**, not row count.
  A backfill issuing one `createMany` per row crawled at ~14 rows/minute; batched
  into one call per 200 rows it finished in seconds.
- **`maxDuration = 300`** is set on discovery, analyze, scoring and cron. Builds
  accept it; that a request actually survives past 60s at runtime has not been
  proven under load.
- **Commit author matters.** A deployment is blocked when the commit author is
  not a member of the Vercel account.

## Tech Stack

- **Next.js 16** (App Router, TypeScript)
- **React 19**, **Tailwind CSS v4**
- **Prisma 6** + **PostgreSQL** (Neon)
- **Better Auth** — sessions and credentials
- **bcryptjs** — password hashing
- **Anthropic Claude** (claude-sonnet-4-5) — discovery, enrichment, scoring, pitches, summaries
- **Jest 30** — unit tests

## Further reading

- `docs/PER_SPEAKER_SPLIT.md` — how the single-speaker app became multi-speaker
- `docs/EVENT_SEARCH_DIRECTIVES.md` — what discovery searches for
- `AGENTS.md` — conventions for working in this repo
