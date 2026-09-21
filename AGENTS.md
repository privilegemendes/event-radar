<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project notes (Event Radar)

- **Access model:** viewing is open (public `GET`s); edits, discovery, and AI
  actions require an ADMIN session. Inside Coder the proxy limits who can reach
  the app.
- **Before any Vercel deploy:** the app has no read-side login wall, so a public
  Vercel URL would be world-viewable. Enable Vercel Access Protection / SSO first.
  Also: SQLite must move to hosted Postgres, `maxDuration = 300` needs Vercel Pro,
  connect via `vercel git connect` (coder-internal, no personal accounts). See the
  **Deployment (Vercel)** section in `README.md` for the full checklist.
- **Prompts are not hardcoded.** Every LLM call renders its speaker profile,
  scoring rubric, exclusions and search plan from the stored profile via
  `src/lib/speaker-brief.ts`. Do not reintroduce a literal `SPEAKER_PROFILE`
  constant — add a profile field instead. The builders are pure and unit-tested
  (`npm test`); `src/lib/profile-schema.ts` is deliberately free of
  `server-only` so the settings form and the tests can import it.
- **Commit as the account that owns the Vercel project** — currently
  `Privilege Mendes <20317699+privilegemendes@users.noreply.github.com>`.
  This is load-bearing, not cosmetic: Vercel blocks a Git-triggered deployment
  whose **commit author** is not authorized on the team, and the deployment
  never builds — it goes straight to `BLOCKED` with no build logs, surfacing on
  the PR only as the generic "Deployment was blocked".

  This file previously said to commit as `Irmak Eyiceoglu <irmak@coder.com>`,
  which silently blocked every Git deployment while CLI deploys (no commit
  author) kept working. Verified by deploying identical content twice on one
  branch: authored by Irmak → `BLOCKED`, authored by the project owner →
  `READY`. Note Vercel keys on the **author**, not the committer — a commit
  authored by Irmak but committed via the GitHub UI was still blocked.

  Check with `git log -1 --format='%an <%ae>'` before pushing; the fix is
  `git config user.email` plus
  `git rebase <base> --exec 'git commit --amend --no-edit --reset-author'`.
- Data lives in the gitignored `prisma/dev.db`.
