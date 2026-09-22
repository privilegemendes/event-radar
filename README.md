# Event Radar

Internal tool for **Irmak Eyiceoglu** (Coder EMEA Partner Manager) to discover, rank, and act on AI events worldwide across three tracks: **Attend** (individually), **Participate** (Coder sponsors/attends as a company), and **Speak** (Irmak's speaking opportunities).

## Features

- **Three tracks** — every event is an ATTEND, PARTICIPATE, or SPEAK opportunity, each ranked within its track (SPEAK by likelihood of acceptance, PARTICIPATE by strategic value, ATTEND by personal relevance)
- **Audience signals** — tags surfacing who each event is for (Developers, Engineers, Customers, Entrepreneurs, SMBs, Professionals, Women in Tech, Partners)
- **Calendar availability** — checks a read-only Google Calendar ICS feed to flag whether Irmak is free for an event/webinar
- **Apply helper** — saved Applicant Profile with one-click copy / prefilled email to speed up CFP applications
- **Event pipeline** — Track events from DISCOVERED → APPROVED → PITCHED → ACCEPTED → SPOKEN
- **Configurable speaker brief** — discovery, scoring and pitches are rendered from a stored profile (speaking level, topics, geographies, credentials, employer angle, exclusions) rather than hardcoded, so the app can be pointed at a different speaker from Settings
- **AI Discovery** — Claude (Anthropic) searches the web for relevant events and podcasts seeking speakers
- **Pitch generator** — Claude drafts tailored speaker application emails
- **Partner-scoped discovery** — Find events linked to specific EMEA partners
- **Calendar view** — Monthly grid of all events
- **Discovery inbox** — Review and approve/reject auto-discovered events
- **Partner CRM** — EMEA partner ecosystem overview
- **Login required** — every page and every read requires a session. MEMBERs can browse and triage the discovery inbox; edits, discovery and AI actions require **ADMIN**

## Setup

```bash
npm install
npx prisma migrate dev --name init
npx prisma db seed
npm run dev
```

Run the tests with:

```bash
npm test
```

## Default Logins

> ⚠️ **All default passwords are `change-me-now` — change immediately on first login.**

| Email | Role | Notes |
|-------|------|-------|
| irmak@coder.com | ADMIN | Primary user |
| assistant@example.com | ADMIN | Secondary admin |
| viewer@coder.com | VIEWER | Read-only access |

The app will display a banner until the default password is changed.

## Environment Variables

### Development (auto-generated in `.env`)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | SQLite: `file:./prisma/dev.db`. Postgres in prod: `postgresql://...` |
| `BETTER_AUTH_SECRET` | Secret Better Auth signs sessions with (32+ chars). Falls back to `SESSION_SECRET` if unset. |
| `BETTER_AUTH_URL` | Where the app is reachable. Optional locally (defaults to `http://localhost:3000`). |
| `SESSION_SECRET` | Legacy fallback for `BETTER_AUTH_SECRET`. |
| `OWNER_EMAIL` | Owner account — sees the Podium and private events. Defaults to `irmak@coder.com`. |

### Production (set manually)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Strong random secret (≥ 32 chars) |
| `BETTER_AUTH_URL` | The app's public URL. **Set this explicitly in production** — it is only inferred from Vercel's env vars otherwise, and `VERCEL_URL` is per-deployment, not the stable domain. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Comma-separated hostnames Better Auth accepts sign-in requests from. **Required when the project answers on more than one domain** — otherwise every host except the `baseURL` gets `Invalid origin` at sign-in. Vercel's per-deployment and branch URLs are added automatically in code. |
| `ANTHROPIC_BASE_URL` | Anthropic API gateway base URL |
| `ANTHROPIC_AUTH_TOKEN` | Anthropic API authentication token |

> In the Coder workspace, `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` are injected automatically. Do not commit them to `.env`.

## Authentication

Sessions are handled by **Better Auth** (email + password; no social providers yet),
stored in the database and therefore revocable — unlike the stateless JWTs this
replaced, which stayed valid for their full 7 days.

- Credentials live in the `account` table (`providerId: "credential"`), not on the
  user row. A user without one cannot sign in, so `POST /api/users` and the seed
  both create it in the same step.
- Passwords stay **bcrypt** via Better Auth's custom `hash`/`verify`, so existing
  users kept their passwords through the migration.
- `role` and `mustChangePassword` are Better Auth `additionalFields` on the user.
  Both are `input: false`, so a caller cannot make itself an ADMIN at sign-up.
- Middleware only checks that a session **cookie exists** — it does not validate
  it, and is not an authorization mechanism. Real checks run server-side in
  `requireSession()` / `requireAdmin()`, and in `app/(protected)/podiums/layout.tsx`
  for the owner-only Podium.

> **This does not make the app private.** Reads are still public by design, so the
> deployment continues to depend on Vercel Access Protection. Gating reads behind
> a login is a separate, open product decision.

### Re-generating the auth schema

`npx @better-auth/cli generate` rewrites `prisma/schema.prisma`. It re-adds
`@@map("user")` to the `User` model every time — **delete it**, or the next
migration renames a populated table.

## Speaker brief

Every prompt sent to Claude is rendered from the profile stored in
**Settings → Speaker Brief**, not hardcoded. The fields that change AI behaviour:

| Field | Effect |
|-------|--------|
| Speaking level | Selects the scoring rubric. `FIRST_TIME` scores meetups and podcasts highest and mega-conference keynotes lowest; `KEYNOTE` inverts that. |
| Signature topics | Searched for, and scored against. |
| Priority locations | Discovery searches each one separately (depth comes from distinct slices). |
| Speaking credentials | Cited in generated pitch emails. |
| Employer angle | Enables the PARTICIPATE track and the employer-framed pitch. Blank = always pitch as an independent speaker. |
| Excluded event types | Dropped from discovery entirely. Blank = nothing excluded. |
| Private-event keywords | Matching events are visible only to the owner. |
| Rubric override | Replaces the generated rubric wholesale. |

The builders live in `src/lib/speaker-brief.ts` and are pure functions covered by
`src/lib/speaker-brief.test.ts`.

> **Upgrading an existing deployment:** the profile row predates these fields, so
> back-fill them with the values that used to be hardcoded before the next
> discovery run — otherwise it goes out with an empty brief:
>
> ```bash
> npx tsx scripts/backfill-speaker-brief.ts          # dry run
> npx tsx scripts/backfill-speaker-brief.ts --write  # apply
> ```

## Discovery

Discovery uses the **Anthropic Claude** API with the `web_search` tool (`web_search_20250305`) to search the web for:

- AI/tech events and conferences in Amsterdam/NL and London/UK with open CFPs
- Events in the rest of Europe and Austin TX, plus Women-in-Tech / Women-in-AI communities
- Online podcasts and webinars on AI, developer tools, or Sovereign AI

Results are deduplicated against existing events and added as `DISCOVERED` status for review in the Inbox.

### Automatic (continuous) discovery

Discovery also runs on a schedule so new events keep arriving without clicking anything:

- **Endpoint:** `POST|GET /api/cron/discovery` — rotates its search focus each run
  (Women-in-Tech, founder meetups, AI podcasts, …), skips duplicates, and refuses
  to overlap a run already in progress.
- **Toggle:** Settings → **Automatic Discovery** (on by default; stored in `AppSetting`).
- **Production (Vercel):** `vercel.json` defines a cron **weekly** (Mondays 09:00 UTC). Set a
  `CRON_SECRET` env var to lock the endpoint down — Vercel Cron sends it as
  `Authorization: Bearer <CRON_SECRET>`. (Cron + the 300s `maxDuration` need a Vercel **Pro** team.)
- **In a Coder workspace:** run `npm run auto-discovery` (loop that calls the endpoint
  every `INTERVAL_HOURS`, default 168 = weekly). It only runs while the workspace is up; prefer the
  Vercel cron for true 24/7.

## Deployment (Vercel)

> **Not yet deployed.** When deploying, follow the SMART AI Guidelines
> (https://github.com/coder/smart-ai-program/tree/main/docs) and use the
> **coder-internal** org for both GitHub and Vercel — no personal accounts.

### Prerequisites & blockers

> Items 1 and 2 were open blockers and are now resolved; they are kept here as
> standing constraints rather than to-dos.

1. **Access protection — DONE, and now belt-and-braces.** The app has its own
   login wall: every page redirects to `/login` without a session, and every
   `GET` answers 401. Vercel Access Protection (`ssoProtection`) is also enabled,
   covering production URLs and all previews.

   Either alone would do. Dropping Vercel's layer is now a safe option if you
   want the app reachable by people who are not on the Vercel team — which was
   the reason it was only visible to one person.
2. **Database — DONE.** The Prisma datasource is already `postgresql`, backed by
   a hosted **Neon** instance, with `DATABASE_URL` (pooled) and
   `DATABASE_URL_UNPOOLED` (direct) set. Verified 2026-09-21 by connecting to it.
   Note Neon auto-suspends: a cold start can exceed Prisma's default 10s pool
   timeout, so one-off scripts should use the unpooled URL with a raised
   `connect_timeout` (see `scripts/backfill-speaker-brief.ts`).
3. **Function duration — probably fine, not proven at runtime.** Discovery,
   analyze and cron routes set `maxDuration = 300`. This was written down as
   needing a **Vercel Pro** team; that looks outdated:

   - Vercel's current docs show `export const maxDuration = 1800` as a valid
     App Router value, and the platform default is now 300s across plans.
   - A build on the **Hobby** team accepted all three 300s routes with no
     warning (2026-09-21).

   What has **not** been shown is that a request actually survives past the old
   60s ceiling at runtime — a plan cap would clamp silently at invocation, not
   fail the build. To settle it, deploy a route that sleeps ~75s and open it in
   a browser (deployments are behind Vercel SSO, so an unauthenticated fetch
   just 302s to `vercel.com/sso-api`). If the 300s limit does *not* hold, the
   weekly cron discovery run is what breaks.
4. **Env vars** (Vercel project settings): `DATABASE_URL`, `SESSION_SECRET`,
   `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`. The `ANTHROPIC_*` values are only
   injected inside Coder workspaces — copy them into Vercel manually.

### Connect via GitHub (not a bare CLI upload)

```bash
vercel login            # choose the Coder team, NOT a personal account
vercel link             # link to the coder-internal project
vercel git connect      # connect coder-internal/speaking-opportunity-engine
                        # -> auto-deploy on push + PR preview deployments
```

Confirm the git connection (`vercel project ls` or the dashboard) before calling
the deploy done. A bare `vercel --prod` does **not** wire up git.

## Tech Stack

- **Next.js 16** (App Router, TypeScript)
- **Tailwind CSS v4**
- **Prisma** (SQLite dev, Postgres-compatible schema)
- **bcryptjs** — password hashing
- **jose** — JWT session management
- **Anthropic Claude** (claude-sonnet-4-5) — AI discovery + pitch generation
