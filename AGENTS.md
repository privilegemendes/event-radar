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
- Data lives in the gitignored `prisma/dev.db`; commit as
  `Irmak Eyiceoglu <irmak@coder.com>`.
