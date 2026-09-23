/**
 * Authenticated HTTP client for Event Radar.
 *
 * Signs in as a real user (see scripts/create-mcp-service-account.ts for why a
 * service account rather than a bespoke token) and holds the session cookie.
 *
 * Two things here were established by running them, not by reading the code —
 * both would otherwise be a confusing first failure:
 *
 *   • Better Auth rejects a request with no Origin header outright, with 403
 *     MISSING_OR_NULL_ORIGIN, BEFORE it ever looks at credentials. A headless
 *     client must assert one. BASE is the app's own origin, so it is always in
 *     the trustedOrigins list resolveTrustedOrigins() builds.
 *
 *   • getSetCookie() must be used rather than headers.get("set-cookie"). The
 *     latter folds multiple cookies into one comma-joined string that cannot be
 *     split safely, because Expires values contain commas of their own.
 */
export class EventRadarClient {
  #cookie = null;

  constructor({ baseUrl, email, password } = {}) {
    this.base = baseUrl ?? process.env.EVENT_RADAR_URL ?? "http://localhost:3000";
    this.email = email ?? process.env.MCP_SERVICE_EMAIL;
    this.password = password ?? process.env.MCP_SERVICE_PASSWORD;
    if (!this.email || !this.password) {
      throw new Error("MCP_SERVICE_EMAIL and MCP_SERVICE_PASSWORD must be set");
    }
  }

  async signIn() {
    const res = await fetch(`${this.base}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: this.base },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    if (!res.ok) throw new Error(`sign-in failed ${res.status}: ${await res.text()}`);

    const jar = res.headers.getSetCookie?.() ?? [];
    this.#cookie = jar.map((c) => c.split(";")[0]).join("; ");
    if (!this.#cookie) throw new Error("sign-in returned no Set-Cookie");
    return { names: jar.map((c) => c.split("=")[0]), body: await res.json() };
  }

  /** Call the API, signing in on demand and retrying ONCE on a 401. */
  async api(path, init = {}, retry = true) {
    if (!this.#cookie) await this.signIn();
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), cookie: this.#cookie, origin: this.base },
    });
    if (res.status === 401 && retry) {
      this.#cookie = null;              // expired or revoked — re-establish once
      return this.api(path, init, false);
    }
    return res;
  }

  /** api() plus status checking and JSON parsing, for callers that want the body. */
  async json(path, init) {
    const res = await this.api(path, init);
    if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}: ${await res.text()}`);
    return { data: await res.json(), headers: res.headers };
  }

  /** Test seam: force the next call down the re-signin path. */
  expireCookie() { this.#cookie = "better-auth.session_token=invalid"; }
}
