/**
 * Where the Anthropic calls point, and how they authenticate.
 *
 * Three call sites — discovery, analyze, scoring — each carried their own copy
 * of the same base-URL lookup and header block. That is the shape of every
 * drift bug in this codebase so far, and it also meant the credential rules
 * lived in three places at once.
 *
 * Pure: takes an env object rather than reading process.env directly, so the
 * credential and header logic is unit-tested without setting real variables.
 */

/** The official API. Anything else is treated as a gateway or proxy. */
export const OFFICIAL_BASE_URL = "https://api.anthropic.com";

const API_VERSION = "2023-06-01";

export interface AnthropicConfig {
  baseUrl: string;
  headers: Record<string, string>;
}

export interface ResolveOptions {
  /** e.g. "web-search-2025-03-05" for the passes that search. */
  beta?: string;
}

type Env = Record<string, string | undefined>;

/**
 * Resolve credentials and headers, or null when no key is configured.
 *
 * Two env names are accepted for the key. `ANTHROPIC_API_KEY` is what Anthropic
 * and every SDK call it, so a plain key works with no further setup;
 * `ANTHROPIC_AUTH_TOKEN` is what this app used first, for a gateway that wanted
 * a bearer token, and is kept so existing deployments do not break. When both
 * are set the explicit AUTH_TOKEN wins, because that is the one someone chose
 * for a non-default endpoint.
 *
 * The base URL defaults to the official API, so setting only a key is enough.
 */
export function resolveAnthropic(env: Env, opts: ResolveOptions = {}): AnthropicConfig | null {
  const key = (env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY || "").trim();
  if (!key) return null;

  const baseUrl = (env.ANTHROPIC_BASE_URL || OFFICIAL_BASE_URL).trim().replace(/\/+$/, "");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": API_VERSION,
    "x-api-key": key,
  };

  /* A bearer header goes only to a gateway, never to the official API.
     Gateways in front of Anthropic commonly want `Authorization: Bearer`, and
     this app sent both headers to everything — harmless against the bridge it
     was written for, but the official API authenticates on x-api-key alone and
     there is no reason to hand it a second, conflicting credential header. */
  if (baseUrl !== OFFICIAL_BASE_URL) {
    headers.Authorization = `Bearer ${key}`;
  }

  if (opts.beta) headers["anthropic-beta"] = opts.beta;

  return { baseUrl, headers };
}

/** The messages endpoint for a resolved config. */
export function messagesUrl(config: AnthropicConfig): string {
  return `${config.baseUrl}/v1/messages`;
}

/** The beta header the web-search passes need. */
export const WEB_SEARCH_BETA = "web-search-2025-03-05";
