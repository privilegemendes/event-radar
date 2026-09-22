/**
 * Create an ADMIN user, or promote an existing one.
 *
 * The password is read from the environment and never printed, logged, or
 * passed on the command line (argv is visible to other processes via `ps`).
 * Run it yourself so the value never leaves your machine:
 *
 *   ADMIN_EMAIL=you@example.com \
 *   ADMIN_NAME="Your Name" \
 *   ADMIN_PASSWORD='...' \
 *   npx tsx --env-file=.env scripts/add-admin.ts
 *
 * Safe to re-run: an existing user is promoted to ADMIN and, only if
 * ADMIN_PASSWORD is given, has their password reset.
 *
 * Credentials live in the `account` table (providerId "credential"), not on the
 * user row — that is where Better Auth reads them. This script writes both, in
 * one transaction, so the user it reports can actually sign in.
 *
 * It did not always. It used to write only `User.passwordHash` and leave the
 * backfill to scripts/migrate-passwords-to-account.ts as a separate step, which
 * meant a user created here was handed a working-looking account that failed at
 * the login screen with "User not found". `User.passwordHash` is still written
 * alongside, matching what that migration deliberately leaves in place as a
 * rollback path.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

function directUrl(): string {
  const base = (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "").replace(/^"|"$/g, "");
  if (!base) throw new Error("DATABASE_URL (or DATABASE_URL_UNPOOLED) is not set");
  const u = new URL(base);
  u.searchParams.set("connect_timeout", "60");
  u.searchParams.set("pool_timeout", "60");
  return u.toString();
}

const db = new PrismaClient({ datasources: { db: { url: directUrl() } } });

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const name = (process.env.ADMIN_NAME ?? "").trim();
  const password = process.env.ADMIN_PASSWORD ?? "";

  if (!email) throw new Error("ADMIN_EMAIL is required");

  const existing = await db.user.findUnique({ where: { email }, select: { id: true, role: true, name: true } });

  if (existing) {
    const data: { role: "ADMIN"; passwordHash?: string; mustChangePassword?: boolean } = { role: "ADMIN" };
    let hash: string | null = null;
    if (password) {
      if (password.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters");
      hash = await bcrypt.hash(password, 12);
      data.passwordHash = hash;
      data.mustChangePassword = false;
    }

    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { email }, data });
      if (!hash) return;

      /* Upsert rather than create: an existing user may already have a
         credential account (most do), and may also have none — a user made by
         an older version of this script, or by a seed. Both have to end up
         with the new password. */
      const account = await tx.account.findFirst({
        where: { userId: existing.id, providerId: "credential" },
        select: { id: true },
      });
      if (account) {
        await tx.account.update({ where: { id: account.id }, data: { password: hash, updatedAt: new Date() } });
      } else {
        await tx.account.create({
          data: {
            id: randomUUID(),
            accountId: existing.id,
            providerId: "credential",
            userId: existing.id,
            password: hash,
            updatedAt: new Date(),
          },
        });
      }
    });

    console.log(`Updated ${email}: role ${existing.role} -> ADMIN${password ? ", password reset (user + credential account)" : ", password unchanged"}`);
    return;
  }

  if (!password) throw new Error("ADMIN_PASSWORD is required when creating a new user");
  if (password.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters");
  if (!name) throw new Error("ADMIN_NAME is required when creating a new user");

  const passwordHash = await bcrypt.hash(password, 12);

  /* Both rows in one transaction: a user without a credential account is a
     broken account, not a partial one — it cannot sign in at all. */
  await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: "ADMIN",
        // The password was chosen by the person running this, not a shared
        // default, so there is nothing to force a change of.
        mustChangePassword: false,
      },
      select: { id: true },
    });
    await tx.account.create({
      data: {
        id: randomUUID(),
        accountId: created.id,
        providerId: "credential",
        userId: created.id,
        password: passwordHash,
        updatedAt: new Date(),
      },
    });
  });
  console.log(`Created ADMIN ${email} (${name}) with a credential account — they can sign in now`);
}

main().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); })
      .finally(() => db.$disconnect());
