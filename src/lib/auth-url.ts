/**
 * Where this app is reachable, and the MCP resource identifier derived from it.
 *
 * Deliberately free of the Better Auth import, like auth-error.ts: that package
 * is ESM-only and Jest cannot load it, so anything that needs a unit test has
 * to live outside auth.ts. These are pure functions of the environment.
 */

/**
 * Read an environment variable as a URL part, trimming surrounding whitespace.
 *
 * `echo "https://…" | vercel env add` stores the trailing NEWLINE as part of
 * the value, and nothing downstream objects. The origin survives
 * `new URL(x).origin` intact, so the authorization server metadata looks
 * correct, while the protected resource identifier reads
 * "https://host\n/api/mcp". Tokens are audience-bound to that, no client can
 * compute a matching identifier, and authorization fails with nothing in the
 * logs pointing at a stray character. It cost a production debugging session.
 *
 * Whitespace is never meaningful in any of these values, so it is stripped at
 * the boundary rather than trusted to have been set carefully.
 */
export function envUrlPart(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const v = env[name]?.trim();
  return v ? v : undefined;
}

/**
 * On Vercel, VERCEL_URL is the *per-deployment* hostname (it changes on every
 * push), so using it in production would pin auth to a URL nobody visits.
 * VERCEL_PROJECT_PRODUCTION_URL is the stable one. An explicit BETTER_AUTH_URL
 * always wins.
 */
export function resolveBaseURL(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = envUrlPart("BETTER_AUTH_URL", env);
  if (explicit) return explicit;

  const productionHost = envUrlPart("VERCEL_PROJECT_PRODUCTION_URL", env);
  if (env.VERCEL_ENV === "production" && productionHost) return `https://${productionHost}`;

  const deploymentHost = envUrlPart("VERCEL_URL", env);
  if (deploymentHost) return `https://${deploymentHost}`;

  if (env.NODE_ENV !== "production") return "http://localhost:3000";
  return undefined;
}

/**
 * The canonical protected-resource identifier for the MCP server (RFC 8707 /
 * RFC 9728). Tokens are audience-bound to it and it is published in the
 * protected resource metadata, so it must be the URL a client actually calls —
 * character for character.
 */
export function resolveMcpResource(env: NodeJS.ProcessEnv = process.env): string {
  const base = resolveBaseURL(env) ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/mcp`;
}
