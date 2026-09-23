# Handover — 2026-09-23

The GitHub repo and Vercel project moved from a freelancer's personal accounts
to **`irmakcoderai`**. The app's own owner is unchanged: `OWNER_EMAIL` is still
`irmak@coder.com`, which is the account that sees the Podium and private events.

This file is the things that are not obvious from the code, ordered by what will
bite first.

---

## 1. Rotate these

| Secret | Why |
|---|---|
| `ANTHROPIC_AUTH_TOKEN` | **Was exposed in a working session's terminal output.** Rotate regardless of the handover. |
| `BETTER_AUTH_SECRET` | The previous owner has seen it. Rotating signs everyone out and invalidates every issued OAuth token, including MCP connectors — expect to reconnect them. |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Neon credentials. Reissue with the project. |

Also: the seeded admin accounts (`irmak@coder.com`, `assistant@example.com`)
were last reported still on the default password `change-me-now`. The app shows
a banner until it is changed.

## 2. Deployments can fail with no error at all

Vercel blocks a Git-triggered deployment whose **commit author** is not
authorized on the team. It never builds — no logs, just `BLOCKED`, surfacing on
the PR as "Deployment was blocked". See `AGENTS.md`; the rule is "whoever owns
the Vercel team", and that entry has been wrong twice now.

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

## 7. Known gaps

- `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` are unset in production, so the
  weekly cron does nothing and the web app's AI buttons fail. Optional if
  everyone uses MCP; required otherwise.
- The app's `EventOpportunity` rows are sparse — production had none at the time
  of writing, so most events read as unscored. `scripts/backfill-event-opportunities.ts`
  and the scoring tools fill them.
- `README.md` still names the **coder-internal** org for GitHub and Vercel,
  which is not where this lives.
