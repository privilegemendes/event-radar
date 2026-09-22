import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import bcrypt from "bcryptjs";
import { db } from "./db";

/**
 * Better Auth configuration.
 *
 * Deliberately NOT marked `server-only`: the Better Auth CLI loads this file
 * outside Next's bundler to generate the Prisma schema, and cannot resolve that
 * module. It is server-safe regardless — it imports PrismaClient and reads
 * secrets, so it can never be bundled for the client.
 *
 * Email + password only for now — no social providers. Note this does NOT make
 * the app private: reads are public by design, so the deployment still relies on
 * Vercel Access Protection until that product decision changes.
 */
/**
 * Where this app is reachable, used for cookies, callbacks and redirects.
 *
 * On Vercel, VERCEL_URL is the *per-deployment* hostname (it changes on every
 * push), so using it in production would pin auth to a URL nobody visits.
 * VERCEL_PROJECT_PRODUCTION_URL is the stable one. Previews legitimately want
 * the per-deployment host. An explicit BETTER_AUTH_URL always wins.
 */
function resolveBaseURL(): string | undefined {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  return undefined;
}

/**
 * Origins Better Auth will accept a request from.
 *
 * Better Auth rejects any request whose Origin header does not match the
 * baseURL, with "Invalid origin". This project answers on several hostnames —
 * two named production domains plus Vercel's per-deployment and per-branch
 * aliases — so matching only the baseURL locks sign-in out of all but one.
 *
 * Deliberately NOT a "*.vercel.app" wildcard: that would trust every app on
 * Vercel, which is the whole point of the check. Each host is named, and extra
 * ones can be added through BETTER_AUTH_TRUSTED_ORIGINS without a deploy.
 */
function resolveTrustedOrigins(): string[] {
  const origins = new Set<string>();

  const base = resolveBaseURL();
  if (base) origins.add(base);

  // This deployment's own URL, and the branch alias — covers previews.
  if (process.env.VERCEL_URL) origins.add(`https://${process.env.VERCEL_URL}`);
  if (process.env.VERCEL_BRANCH_URL) origins.add(`https://${process.env.VERCEL_BRANCH_URL}`);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    origins.add(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }

  // Named production domains, comma-separated, bare host or full origin.
  for (const raw of (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(",")) {
    const v = raw.trim();
    if (v) origins.add(v.startsWith("http") ? v : `https://${v}`);
  }

  if (process.env.NODE_ENV !== "production") origins.add("http://localhost:3000");

  return [...origins];
}

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),

  /* The old jose-based sessions signed with SESSION_SECRET are being replaced,
     which frees that value. Preferring BETTER_AUTH_SECRET lets it be rotated
     independently later without a deploy-time scramble for a new env var. */
  secret: process.env.BETTER_AUTH_SECRET || process.env.SESSION_SECRET,

  baseURL: resolveBaseURL(),
  trustedOrigins: resolveTrustedOrigins(),

  emailAndPassword: {
    enabled: true,
    // No mail is sent from this app, so there is nothing to verify against.
    requireEmailVerification: false,
    password: {
      /* Keep bcrypt rather than Better Auth's default scrypt: the existing
         users' hashes were made with bcryptjs at cost 12, and rehashing them
         would mean resetting passwords for people who cannot receive a reset
         email. Verification stays bcrypt-compatible; new passwords are hashed
         at the same cost the seed used. */
      hash: (password) => bcrypt.hash(password, 12),
      verify: ({ hash, password }) => bcrypt.compare(password, hash),
    },
  },

  user: {
    additionalFields: {
      /* Carried over from the old User model. `input: false` keeps them out of
         the public sign-up payload — a caller must not be able to make itself
         an ADMIN by posting a role. */
      role: {
        type: "string",
        required: false,
        defaultValue: "MEMBER",
        input: false,
      },
      mustChangePassword: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days, matching the sessions being replaced
    updateAge: 60 * 60 * 24,     // refresh the expiry at most once a day
  },
});
