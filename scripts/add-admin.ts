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
 * NOTE: once the Better Auth work merges, credentials live in the `account`
 * table rather than on the user row. scripts/migrate-passwords-to-account.ts
 * on that branch picks up any user created here and backfills it, so this
 * stays correct across the transition.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

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
    if (password) {
      if (password.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters");
      data.passwordHash = await bcrypt.hash(password, 12);
      data.mustChangePassword = false;
    }
    await db.user.update({ where: { email }, data });
    console.log(`Updated ${email}: role ${existing.role} -> ADMIN${password ? ", password reset" : ", password unchanged"}`);
    return;
  }

  if (!password) throw new Error("ADMIN_PASSWORD is required when creating a new user");
  if (password.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters");
  if (!name) throw new Error("ADMIN_NAME is required when creating a new user");

  await db.user.create({
    data: {
      email,
      name,
      passwordHash: await bcrypt.hash(password, 12),
      role: "ADMIN",
      // The password was chosen by the person running this, not a shared
      // default, so there is nothing to force a change of.
      mustChangePassword: false,
    },
  });
  console.log(`Created ADMIN ${email} (${name})`);
}

main().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); })
      .finally(() => db.$disconnect());
