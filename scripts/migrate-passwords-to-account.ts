/**
 * One-time: move each user's bcrypt hash from User.passwordHash into the
 * Better Auth `account` table.
 *
 * Better Auth keeps credentials in `account` with providerId "credential", not
 * on the user row. Without this, every existing user would be unable to sign in
 * after the swap — Better Auth would find no credential account for them.
 *
 * User.passwordHash is left in place on purpose: it is the rollback path until
 * sign-in has been exercised in production. Only fills users that have no
 * credential account yet, so it is safe to re-run.
 *
 *   npx tsx --env-file=.env scripts/migrate-passwords-to-account.ts          # dry run
 *   npx tsx --env-file=.env scripts/migrate-passwords-to-account.ts --write  # apply
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

function directUrl(): string {
  const base = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL (or DATABASE_URL_UNPOOLED) is not set");
  const u = new URL(base);
  u.searchParams.set("connect_timeout", "60");
  u.searchParams.set("pool_timeout", "60");
  return u.toString();
}

const db = new PrismaClient({ datasources: { db: { url: directUrl() } } });
const WRITE = process.argv.includes("--write");

async function main() {
  const users = await db.user.findMany({
    select: { id: true, email: true, passwordHash: true, accounts: { select: { id: true, providerId: true } } },
    orderBy: { createdAt: "asc" },
  });

  const todo: typeof users = [];
  for (const u of users) {
    const has = u.accounts.some((a) => a.providerId === "credential");
    if (has) { console.log(`  skip  ${u.email} — already has a credential account`); continue; }
    if (!u.passwordHash) { console.log(`  WARN  ${u.email} — no passwordHash, cannot sign in with a password`); continue; }
    todo.push(u);
  }

  console.log(`\n${todo.length} user(s) to migrate: ${todo.map((u) => u.email).join(", ") || "(none)"}`);
  if (!todo.length) return;
  if (!WRITE) { console.log("\nDry run — re-run with --write to apply."); return; }

  for (const u of todo) {
    await db.account.create({
      data: {
        id: randomUUID(),
        accountId: u.id,          // Better Auth uses the user id for credential accounts
        providerId: "credential",
        userId: u.id,
        password: u.passwordHash, // bcrypt hash, verified by the custom verify() in lib/auth.ts
        updatedAt: new Date(),
      },
    });
    console.log(`  migrated ${u.email}`);
  }
  console.log(`\nMigrated ${todo.length} credential account(s). User.passwordHash left intact as a rollback path.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
