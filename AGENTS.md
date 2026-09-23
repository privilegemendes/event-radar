<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project notes (Event Radar)

- **Access model:** viewing is open (public `GET`s); edits, discovery, and AI
  actions require an ADMIN session. Inside Coder the proxy limits who can reach
  the app.
- **Vercel deploy state (verified 2026-09-21):** Access Protection is **enabled**
  (`ssoProtection`, production + all previews) — the app has no read-side login of
  its own, so do not disable it without an equivalent gate. The datasource is
  already hosted **Postgres** on Neon, not SQLite. The GitHub repo and Vercel
  project moved from a freelancer's personal accounts to `irmakcoderai` on
  2026-09-23; the README's SMART AI Guidelines name the **coder-internal** org
  for both, which is still not where this lives. See the **Deployment (Vercel)**
  section in `README.md`.
- **Auth is Better Auth**, not the old jose JWTs. `src/lib/session.ts` keeps the
  same `getSession` / `requireSession` / `requireAdmin` / `authErrorResponse` API
  that every route already uses, so routes should not talk to Better Auth
  directly. `src/lib/auth-error.ts` is deliberately free of the Better Auth
  import (ESM-only, unloadable by Jest) and holds the unit-tested parts.
  Credentials live in `account`, not on the user row — anything creating a user
  must create a `providerId: "credential"` row too, or that user cannot sign in.
  Running `npx @better-auth/cli generate` re-adds `@@map("user")` to the `User`
  model; delete it, or the next migration renames a populated table.
- **Prompts are not hardcoded.** Every LLM call renders its speaker profile,
  scoring rubric, exclusions and search plan from the stored profile via
  `src/lib/speaker-brief.ts`. Do not reintroduce a literal `SPEAKER_PROFILE`
  constant — add a profile field instead. The builders are pure and unit-tested
  (`npm test`); `src/lib/profile-schema.ts` is deliberately free of
  `server-only` so the settings form and the tests can import it.
- **Commit as an account authorized on the Vercel team** that owns this
  project — since the 2026-09-23 handover that is `irmakcoderai`
  (`275117545+irmakcoderai@users.noreply.github.com`, if GitHub's id-prefixed
  noreply is in use; confirm with `git log -1 --format='%ae'` on your own first
  commit rather than trusting this line).

  This is load-bearing, not cosmetic: Vercel blocks a Git-triggered deployment
  whose **commit author** is not authorized on the team, and the deployment
  never builds — it goes straight to `BLOCKED` with no build logs, surfacing on
  the PR only as the generic "Deployment was blocked".

  **Treat the name above as stale the moment ownership moves again.** The rule
  is "whoever owns the Vercel team", not any particular person; this entry has
  now been wrong twice, and each time the symptom was deployments that stopped
  without an error anyone could read.

  History, because the failure is invisible and worth recognising: this file
  once said to commit as `Irmak Eyiceoglu <irmak@coder.com>`, which silently
  blocked every Git deployment while CLI deploys (no commit author) kept
  working. Verified by deploying identical content twice on one branch —
  authored by Irmak → `BLOCKED`, authored by the project owner → `READY`.
  Vercel keys on the **author**, not the committer: a commit authored by Irmak
  but committed through the GitHub UI was still blocked.

  Check with `git log -1 --format='%an <%ae>'` before pushing; the fix is
  `git config user.email` plus
  `git rebase <base> --exec 'git commit --amend --no-edit --reset-author'`.
- Data lives in the gitignored `prisma/dev.db`.
