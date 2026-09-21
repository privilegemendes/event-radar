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
- **Open viewing, admin editing** — anyone who can reach the app can view (reads are public); edits, discovery, and AI actions require an **ADMIN** login

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
| `SESSION_SECRET` | 64-char hex secret for JWT signing |
| `OWNER_EMAIL` | Owner account — sees the Podium and private events. Defaults to `irmak@coder.com`. |

### Production (set manually)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Strong random secret (≥ 64 chars) |
| `ANTHROPIC_BASE_URL` | Anthropic API gateway base URL |
| `ANTHROPIC_AUTH_TOKEN` | Anthropic API authentication token |

> In the Coder workspace, `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` are injected automatically. Do not commit them to `.env`.

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

**Live: https://eventradar-coder.vercel.app** — Vercel project `eventradar`
(scope `privilegemendes-projects`), connected to `privilegemendes/event-radar`,
so pushes to `main` auto-deploy and PRs get preview deployments. First deployed
2026-09-21.

> **Two deviations from the plan above, recorded deliberately.** This runs under
> a **personal** Vercel account rather than the **coder-internal** org, because
> no `coder-internal` team exists on the current login. And the URL is
> `eventradar-coder.vercel.app` because `eventradar.vercel.app` *and*
> `event-radar.vercel.app` are both already claimed by other Vercel accounts —
> `*.vercel.app` names are globally unique, so neither is obtainable.

### Standing constraints

1. **Access protection — NOT closed. The production domain is public.**
   Reads in this app are unauthenticated by design (`GET`s are public; only
   writes require an admin session — see `src/middleware.ts`), so whatever is
   reachable is world-readable.

   `ssoProtection` is enabled, but at `deploymentType:
   "prod_deployment_urls_and_all_previews"`, which **excludes assigned
   production domains**. Measured 2026-09-21 with unauthenticated requests:

   | URL | Result |
   |-----|--------|
   | `eventradar-<hash>-privilegemendes-projects.vercel.app` (raw deployment) | `302` → protected |
   | `eventradar-coder.vercel.app` (the real URL) | **`200` → public** |
   | `eventradar-gray.vercel.app` (auto-assigned) | **`200` → public** |

   **Reading the setting back from the API is not a verification** — it reports
   protection as on while the production domain still serves `200`. Always
   confirm with an unauthenticated `curl` against the domain people actually
   use.

   To close it, set `deploymentType` to `"all"` (dashboard → Deployment
   Protection → Vercel Authentication → **All Deployments**). The CLI has no
   flag for this; `vercel project protection enable --sso` selects the weaker
   setting above. Note that `"all"` also locks out everyone who is not on the
   Vercel account — if the tool needs to stay usable by named users, the real
   fix is a read-side login wall in `src/middleware.ts` instead.

2. **Database — DONE.** The Prisma datasource is already `postgresql`, backed by
   a hosted **Neon** instance, with `DATABASE_URL` (pooled) and
   `DATABASE_URL_UNPOOLED` (direct) set. Verified 2026-09-21 by connecting to it.
   Note Neon auto-suspends: a cold start can exceed Prisma's default 10s pool
   timeout, so one-off scripts should use the unpooled URL with a raised
   `connect_timeout` (see `scripts/backfill-speaker-brief.ts`).

   Migrations run on every deploy — the build command is
   `prisma migrate deploy && next build`, and Prisma Migrate uses the schema's
   `directUrl` (`DATABASE_URL_UNPOOLED`), so it bypasses the pooler correctly.

   **Preview deployments currently share the production database.** A preview
   branch can mutate real partner and event data; give previews their own Neon
   branch before relying on them.

3. **Function duration — probably fine, not proven at runtime.** Discovery,
   analyze and cron routes set `maxDuration = 300`. This was written down as
   needing a **Vercel Pro** team; that looks outdated:

   - Vercel's current docs show `export const maxDuration = 1800` as a valid
     App Router value, and the platform default is now 300s across plans.
   - A build on the **Hobby** team accepted all three 300s routes with no
     warning (2026-09-21).

   What has **not** been shown is that a request actually survives past the old
   60s ceiling at runtime — a plan cap would clamp silently at invocation, not
   fail the build. To settle it, deploy a route that sleeps ~75s and request it.
   Use the **production domain**, which is not behind SSO (see item 1); the raw
   deployment URL would `302` to `vercel.com/sso-api`. If the 300s limit does
   *not* hold, the weekly cron discovery run is what breaks.

4. **Env vars.** Set in the project today, for **production and preview**:

   | Variable | Status |
   |----------|--------|
   | `DATABASE_URL` | set (Neon, pooled) |
   | `DATABASE_URL_UNPOOLED` | set (Neon, direct — used by Migrate) |
   | `SESSION_SECRET` | set |
   | `CRON_SECRET` | set — without it `/api/cron/discovery` is **open to anyone** |
   | `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` | **deliberately unset** |
   | `OWNER_EMAIL` | unset — falls back to `irmak@coder.com` per `src/lib/owner.ts` |

   The `ANTHROPIC_*` pair is unset on purpose: the workspace values point at the
   Coder AI bridge (`cdrstable.dev`), which is injected inside Coder workspaces
   and may be neither reachable nor authorised from Vercel. Until a reachable
   endpoint is supplied, **discovery, pitch generation and the weekly cron will
   fail** — everything else works.

### Git connection

Already connected; `vercel git connect` reports
`privilegemendes/event-radar is already connected to your project`. Confirm with
`vercel project ls` or the dashboard before calling a deploy done — a bare
`vercel --prod` does **not** wire up git.

Two operational notes for this repo:

- `vercel deploy` from a local machine intermittently fails with
  `Error: fetch failed` during source upload, leaving deployments stuck in
  status `UNKNOWN` that never build. **`vercel redeploy <url>` builds
  server-side** and avoids the local upload path entirely.
- A `*.vercel.app` alias set with `vercel alias set` is pinned to one
  deployment. For a domain to follow production it must also be assigned to the
  project; verify by deploying again and checking the new deployment's alias
  list rather than assuming.

## Tech Stack

- **Next.js 16** (App Router, TypeScript)
- **Tailwind CSS v4**
- **Prisma** (SQLite dev, Postgres-compatible schema)
- **bcryptjs** — password hashing
- **jose** — JWT session management
- **Anthropic Claude** (claude-sonnet-4-5) — AI discovery + pitch generation
