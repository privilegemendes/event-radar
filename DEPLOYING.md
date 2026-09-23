# Deploying your own copy

Cloning this repo and deploying it to your own Vercel gives you a working app
with an EMPTY catalogue: `prisma db seed` creates the three accounts and the
partner list, and no events. Events arrive through discovery, or by copying data
from an existing instance — see **Bringing data with you** at the end, which is
a privacy decision as much as a technical one.

This file is the things that are not obvious from the code, ordered by what will
bite first. `README.md` has the full environment-variable table.

---

## 0. What a new deployment needs

| | |
|---|---|
| **Database** | Your own Neon (or any Postgres). `DATABASE_URL` pooled, `DATABASE_URL_UNPOOLED` direct. |
| **`BETTER_AUTH_SECRET`** | 32+ characters, yours alone. Never reuse another instance's. |
| **`BETTER_AUTH_URL`** | Your public URL — see §3, it is load-bearing for MCP. |
| **`OWNER_EMAIL`** | Whoever should see the Podium and private events. Defaults to `irmak@coder.com`. |
| **`ANTHROPIC_API_KEY`** | Only if you want the cron and the web app's AI buttons. MCP tools can run on the caller's own model instead — see §6. |
| **`CRON_SECRET`** | Locks the cron endpoint in production. |

Migrations run automatically in the production build. **Seeding does not** —
run `npx prisma db seed` once against the new database, then change the default
passwords immediately.


---

## 1. Secrets

**Generate your own; never copy another instance's.** `BETTER_AUTH_SECRET`
signs sessions and OAuth tokens, so a shared one means two deployments can mint
credentials for each other.

The seed creates `irmak@coder.com` and `assistant@example.com` as ADMIN and
`viewer@coder.com` as MEMBER, all on the default password. **Change them on
first sign-in** — the app shows a banner until you do, and a public URL with a
known default password is an open door.

## 2. Deployments can fail with no error at all

Vercel blocks a Git-triggered deployment whose **commit author** is not
authorized on the team. It never builds — no logs, just `BLOCKED`, surfacing on
the PR as "Deployment was blocked".

On a clone this is the first thing to get right: `AGENTS.md` names the account
for the ORIGINAL repo, so change it to yours, or an agent reading it will
author commits that your Vercel team does not recognise. The rule is "whoever
owns the Vercel team" — the name in that file has been wrong before.

## 3. `BETTER_AUTH_URL` pins the MCP resource identifier

OAuth tokens are audience-bound to `<BETTER_AUTH_URL>/api/mcp`. If the domain
changes, every issued token stops validating — and the symptom is a generic
"authorization failed", not anything naming the URL.

Set it with `printf`, never `echo`:

```bash
printf "https://your-domain" | vercel env add BETTER_AUTH_URL production
```

`echo` appends a newline, Vercel stores it, and the resource identifier becomes
`"https://host\n/api/mcp"`. The origin survives `new URL(x).origin` intact, so
the authorization-server metadata looks perfectly correct while every
authorization fails. The code now trims it, but a stored value with a stray
newline is still misleading to read.

## 4. Never let Prisma reset the database

`prisma migrate dev` may drop and recreate the schema **without an interactive
prompt** when it decides drift is unreconcilable. It did exactly that to a local
database holding 1,326 events, mid-session, while the intent was to add indexes.

Generate the SQL and apply it deliberately:

```bash
npx prisma migrate diff --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma --script > next.sql
```

`migrate diff` only prints; `migrate deploy` only applies pending migrations.
Neither can reset. `scripts/migrate-prod.sh` wraps the production case and
refuses when the database it resolved is not the one it announced — a real
guard, because a `.env` in a fresh checkout points at **production**.

Migrations also run automatically in the production build (`npm run build`), so
the schema is always ahead of the code that needs it and a failed migration
fails the build.

## 5. Deliberate choices that look like mistakes

Do not "fix" these back without asking:

- **Previews share the production database.** That is why the build-time
  migration is guarded on `VERCEL_ENV=production` — unguarded, every preview
  would migrate production before its PR merged. The cost: a preview of a branch
  adding a migration runs without it and shows errors that resolve on merge.
  Give previews their own database and the guard can go.
- **The Better Auth CLI re-adds `@@map("user")`** to the `User` model. Delete it
  or the next migration renames a populated table.
- **`src/lib/settings.ts` is `server-only`**, which is why `auth-error.ts`,
  `profile-schema.ts`, `auth-url.ts` and `user-role.ts` sit apart from their
  callers — Jest and plain `tsx` cannot load anything that pulls it in.
- **Prisma cannot round-trip a NULL scalar list.** Postgres stores NULL and
  Prisma reads back `[]`. Where the two mean different things — OAuth
  `allowedScopes` treats null as "unrestricted" and `[]` as "nothing permitted"
  — the value must be set explicitly. `src/lib/db.ts` carries a shim and
  explains why absence is not safe to lean on.

## 6. The MCP surface

`/api/mcp` is an OAuth-protected MCP server: a claude.ai custom connector points
at it, authenticates through this app's own `/login` and `/consent`, and gets a
token bound to that person. **16 tools for a member, 18 for an admin.**

Every tool calls the same operation the web app calls —
`listEventsForSpeaker`, `updateEventForSpeaker`, `applyScores`,
`ingestDiscoveredEvents`, `buildPitchPrompt`, `buildSummaryBrief`. That is
deliberate: sharing only the underlying helpers was not enough, and the two
surfaces drifted once, with the MCP tool serving 107 events that had already
happened. Add a tool by calling the shared operation, never by rebuilding the
query.

Scoring, pitches, summaries and discovery can run on the **caller's own model**
(`get_scoring_batch` + `save_scores`, and the equivalents), so the server needs
no Anthropic credentials for those. It still needs them for the weekly cron and
for the web app's own AI buttons.

**A connector caches its tool list when it connects.** After shipping a new
tool, reconnect it or the old list persists.

## 7. Bringing data with you

A fresh deployment has no events. Two ways forward, and the choice is not
purely technical.

**Start empty.** Run discovery and it repopulates over time — that is what it
is for. The catalogue rebuilds from scratch, scored for whoever is using it.
Nothing personal moves between instances. This is the default and the one to
prefer unless there is a reason not to.

**Copy from an existing instance.** `scripts/copy-prod-to-local.ts` does a
Prisma-level copy that preserves ids, relations and types (`pg_dump` stalls
against Neon, and a URL on the command line puts the password in the process
list). Its destination guard refuses anything that is not localhost, so copying
*into* a second hosted database means adapting it deliberately rather than
pointing it somewhere new.

**Before copying, know what is in it.** That data is not just event listings:

- **Speaker records** — real people's names, employers, titles, and AI-written
  outreach notes *about* them
- **The partner CRM** — named contacts and deal stages
- **`User` and `account` rows** — including password hashes
- **`AppSetting`** — holds `WORK_CALENDAR_ICS_URL`, which grants read access to
  a real calendar
- **`SpeakerProfile`** — personal contact details, private keywords

Moving that to a different owner's database is a data-protection decision, not
a migration step. If you copy, copy the `Event` and `Partner` tables and leave
`User`, `account`, `SpeakerProfile` and `AppSetting` behind — the new instance
seeds its own accounts and each speaker fills in their own profile.

Delete any local production copy when you are finished with it.

