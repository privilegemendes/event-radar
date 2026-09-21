# Agent Journal — Event Radar

### 2026-09-21 — Deployed to Vercel (production live)

**What was done:**
- Created Vercel project `eventradar` under scope `privilegemendes-projects`
  (`prj_brPDnpMdf2GNT3OctpBdclYqjS8D`, Node 24.x, framework `nextjs`).
- Build command set to `prisma migrate deploy && next build` (`prisma generate`
  already runs via `postinstall`). Migrations use `directUrl`
  (`DATABASE_URL_UNPOOLED`), so Migrate goes direct, not through the pooler.
- Env vars set for **production + preview**: `DATABASE_URL`,
  `DATABASE_URL_UNPOOLED`, `SESSION_SECRET` (copied from local `.env`), and a
  newly generated `CRON_SECRET`.
- Connected GitHub `privilegemendes/event-radar` → push to `main` auto-deploys,
  PRs get preview deployments.
- Production live at **https://eventradar-coder.vercel.app**.
- Cron registered and verified: `/api/cron/discovery` on `0 9 * * 1`.

**Decisions made:**
- Decision: deployed **public first**, then partially protected.
  Reason: the user was shown that reads are unauthenticated and chose to ship
  public; they later asked for Vercel Access Protection. Vercel had defaulted
  `ssoProtection` ON (`all_except_custom_domains`) at project creation and it
  was explicitly disabled to honour the first decision, then re-enabled.
  **Net state: `prod_deployment_urls_and_all_previews`, which does NOT protect
  the production domain** — see Gotchas. Closing it needs `deploymentType: "all"`.
- Decision: `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` deliberately **not**
  set. Reason: user chose to defer. The local values point at the Coder AI
  bridge (`cdrstable.dev`), which is workspace-injected and may not be
  reachable or authorised from Vercel. Discovery, pitch generation and the
  weekly cron will fail until a reachable Anthropic endpoint is supplied.
- Decision: deployed under the **personal** `privilegemendes` Vercel account.
  Reason: no `coder-internal` team exists on this login, though `README.md`
  mandates one. Revisit if this becomes a shared tool.

**Learnings / Gotchas:**
- **`ssoProtection` read back from the API is not proof the site is protected.**
  At `deploymentType: "prod_deployment_urls_and_all_previews"` the raw
  deployment URL returns 302 while the assigned production domain still returns
  **200 to anonymous requests**. Verified by curl on 2026-09-21 against
  `eventradar-coder.vercel.app` (200) and `eventradar-gray.vercel.app` (200).
  Only `deploymentType: "all"` covers assigned domains. The CLI has no flag for
  it — `vercel project protection enable --sso` picks the weaker setting.
  **Always verify with an unauthenticated request to the real URL.**
- `eventradar.vercel.app` is **taken by another Vercel account** (307);
  `event-radar.vercel.app` too. `*.vercel.app` names are globally unique.
- `vercel deploy` repeatedly failed with `Error: fetch failed` during local
  source upload, leaving deployments in status `UNKNOWN` that never build.
  **`vercel redeploy <url>` builds server-side** and avoids the upload path.
- Vercel **MCP** tools are unreliable on this account: `get_auth_user` 404s,
  `list_projects` returned 1 of 15+ projects, and `update_project` 404s on a
  project that demonstrably exists. `create_project` worked. Prefer the CLI.
- Local `vercel` CLI is 48.2.9 and lacks `project protection` / `crons`;
  `npx vercel@latest` (59.x) has them without a global install.
- `vercel alias set` alone pins an alias to one deployment. Verified separately
  that `eventradar-coder.vercel.app` *is* a project domain and does follow new
  production deploys.
- The access model is correctly enforced: every mutating route does an inline
  `session.role !== "ADMIN"` check (only `calendar/availability` uses a
  `requireAdmin` helper). There is no privilege-escalation hole — the risk is
  purely the weak credential below.

**Blockers / Next steps:**
- **Production domain is still publicly readable.** Set `ssoProtection`
  `deploymentType` to `"all"` (dashboard → Deployment Protection → Vercel
  Authentication → All Deployments), or add a read-side login wall in
  `src/middleware.ts`. The latter keeps the tool usable by named users;
  `"all"` locks out anyone not on the Vercel account.
- **Default admin passwords still live.** `irmak@coder.com` and
  `assistant@example.com` are ADMIN and still hash to `change-me-now` (the
  value documented in `README.md`). `mustChangePassword` is carried in the JWT
  but **no route blocks on it**, so it is a UI prompt, not a gate. An intruder
  can also `POST /api/users` to mint a fresh ADMIN account, which survives
  rotating the original password. `irmak@coder.com` is additionally the
  `OWNER_EMAIL`, unlocking `/podiums` and private events. Rotate before sharing.
- Preview deployments share the **production** Neon database — a preview branch
  can mutate real data. Give previews their own Neon branch.

**References:**
- Production: https://eventradar-coder.vercel.app
- Dashboard: https://vercel.com/privilegemendes-projects/eventradar
