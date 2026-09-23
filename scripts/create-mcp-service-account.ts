/**
 * Create (or reset) the test account used by mcp/oauth-e2e.mjs.
 *
 * NOT how the MCP server authenticates. Real clients get a token through the
 * OAuth flow, as the person who approved the consent screen — see
 * src/app/api/mcp/route.ts. This account exists only so the end-to-end test can
 * stand in for the browser login leg without a human typing a password.
 *
 * Created as MEMBER, not ADMIN. A member can read and run its own scoring but
 * cannot run discovery (which spends money on web search) or edit the shared
 * catalogue. That is the whole least-privilege argument for this approach, and
 * it is enforced by requireAdmin() in the routes, not by the MCP server
 * remembering to gate its own tools.
 *
 * Credentials live in the `account` table, NOT on the user row. A user without
 * a matching providerId:"credential" row cannot sign in at all — see AGENTS.md.
 * bcrypt at cost 12 matches src/lib/auth.ts's configured hash.
 *
 *   npx tsx scripts/create-mcp-service-account.ts          # dry run
 *   npx tsx scripts/create-mcp-service-account.ts --write  # apply, prints password once
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";

const EMAIL = process.env.MCP_SERVICE_EMAIL ?? "mcp-service@example.com";
const WRITE = process.argv.includes("--write");

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL } },
});

async function main() {
  const existing = await db.user.findUnique({ where: { email: EMAIL } });
  const password = process.env.MCP_SERVICE_PASSWORD ?? randomBytes(24).toString("base64url");

  if (!WRITE) {
    console.log(existing ? `Would RESET password for ${EMAIL} (id ${existing.id})` : `Would CREATE ${EMAIL} as MEMBER`);
    console.log("Re-run with --write to apply.");
    return;
  }

  const hash = await bcrypt.hash(password, 12);

  const user = existing
    ? await db.user.update({ where: { id: existing.id }, data: { role: "MEMBER", mustChangePassword: false } })
    : await db.user.create({
        data: { email: EMAIL, name: "MCP Service", role: "MEMBER", mustChangePassword: false, emailVerified: true },
      });

  // upsert the credential row Better Auth actually reads
  const cred = await db.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
  if (cred) {
    await db.account.update({ where: { id: cred.id }, data: { password: hash } });
  } else {
    await db.account.create({
      /* Account.id has no @default — Better Auth generates ids application-side,
         so a direct Prisma insert has to supply one. */
      data: { id: randomUUID(), userId: user.id, accountId: user.id, providerId: "credential", password: hash },
    });
  }

  console.log(`${existing ? "Reset" : "Created"} ${EMAIL} (id ${user.id}, role MEMBER)`);
  if (!process.env.MCP_SERVICE_PASSWORD) {
    console.log(`\nPassword (shown once — put it in .env as MCP_SERVICE_PASSWORD):\n  ${password}\n`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
