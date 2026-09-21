# Event Radar

Internal tool for **Irmak Eyiceoglu** (Coder EMEA Partner Manager) to discover, rank, and act on AI events worldwide across three tracks: **Attend** (individually), **Participate** (Coder sponsors/attends as a company), and **Speak** (Irmak's speaking opportunities).

## Features

- **Three tracks** — every event is an ATTEND, PARTICIPATE, or SPEAK opportunity, each ranked within its track (SPEAK by likelihood of acceptance, PARTICIPATE by strategic value, ATTEND by personal relevance)
- **Audience signals** — tags surfacing who each event is for (Developers, Engineers, Customers, Entrepreneurs, SMBs, Professionals, Women in Tech, Partners)
- **Calendar availability** — checks a read-only Google Calendar ICS feed to flag whether Irmak is free for an event/webinar
- **Apply helper** — saved Applicant Profile with one-click copy / prefilled email to speed up CFP applications
- **Event pipeline** — Track events from DISCOVERED → APPROVED → PITCHED → ACCEPTED → SPOKEN
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

### Production (set manually)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Strong random secret (≥ 64 chars) |
| `ANTHROPIC_BASE_URL` | Anthropic API gateway base URL |
| `ANTHROPIC_AUTH_TOKEN` | Anthropic API authentication token |

> In the Coder workspace, `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` are injected automatically. Do not commit them to `.env`.

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

1. **Access protection (required).** Viewing in this app is intentionally open —
   there is no login wall for reads (`GET`s are public; only writes require an
   admin session). Inside the Coder workspace that is safe because the Coder
   proxy limits who can reach it. On a **public Vercel URL, viewing would be open
   to anyone with the link**, so enable **Vercel Access Protection**
   (Standard Protection / SSO, or Password Protection — Pro/Enterprise) on the
   project, or place it behind Coder/Google SSO, **before sharing the URL**.
2. **Database.** Dev uses SQLite on a local file (`prisma/dev.db`), which does
   **not** work on Vercel's ephemeral filesystem. Switch the Prisma datasource to
   a hosted **Postgres** (Vercel Postgres / Neon), run migrations, and set
   `DATABASE_URL`. (Supabase requires IT coordination via #help-me-ops.)
3. **Function duration.** Discovery/analyze routes set `maxDuration = 300`, which
   requires a **Vercel Pro** team (Hobby caps well below that).
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
