import { envUrlPart, resolveBaseURL, resolveMcpResource } from "./auth-url";

const env = (o: Record<string, string | undefined>) => o as NodeJS.ProcessEnv;

describe("envUrlPart", () => {
  it("strips the trailing newline `echo | vercel env add` leaves behind", () => {
    expect(envUrlPart("X", env({ X: "https://example.com\n" }))).toBe("https://example.com");
  });

  it("strips surrounding whitespace of any kind", () => {
    expect(envUrlPart("X", env({ X: "  https://example.com \r\n" }))).toBe("https://example.com");
  });

  it("treats a whitespace-only value as unset, not as an empty host", () => {
    expect(envUrlPart("X", env({ X: "   " }))).toBeUndefined();
  });

  it("is undefined when unset", () => {
    expect(envUrlPart("X", env({}))).toBeUndefined();
  });
});

describe("resolveBaseURL", () => {
  it("prefers an explicit BETTER_AUTH_URL", () => {
    expect(resolveBaseURL(env({ BETTER_AUTH_URL: "https://named.example", VERCEL_URL: "d.vercel.app" })))
      .toBe("https://named.example");
  });

  it("uses the STABLE production host, not the per-deployment one", () => {
    expect(resolveBaseURL(env({
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "app.vercel.app",
      VERCEL_URL: "deployment-abc123.vercel.app",
    }))).toBe("https://app.vercel.app");
  });

  it("falls back to the per-deployment host off production (previews)", () => {
    expect(resolveBaseURL(env({ VERCEL_ENV: "preview", VERCEL_URL: "deployment-abc123.vercel.app" })))
      .toBe("https://deployment-abc123.vercel.app");
  });

  it("has no answer in production with nothing configured", () => {
    expect(resolveBaseURL(env({ NODE_ENV: "production" }))).toBeUndefined();
  });
});

describe("resolveMcpResource", () => {
  /* The regression this file exists for. A newline inside BETTER_AUTH_URL
     survives `new URL(x).origin`, so the authorization server metadata looks
     right while the resource identifier is malformed — tokens are bound to an
     identifier no client can reproduce, and authorization fails with nothing
     in the logs naming the cause. Observed in production 2026-09-23. */
  it("produces a clean identifier from a value with a trailing newline", () => {
    const resource = resolveMcpResource(env({ BETTER_AUTH_URL: "https://eventradar-coder.vercel.app\n" }));
    expect(resource).toBe("https://eventradar-coder.vercel.app/api/mcp");
    expect(resource).not.toContain("\n");
  });

  it("survives a round-trip through URL parsing unchanged", () => {
    const resource = resolveMcpResource(env({ BETTER_AUTH_URL: "https://eventradar-coder.vercel.app\n" }));
    expect(new URL(resource).href).toBe(resource);
  });

  it("does not double a trailing slash", () => {
    expect(resolveMcpResource(env({ BETTER_AUTH_URL: "https://example.com/" })))
      .toBe("https://example.com/api/mcp");
  });

  it("defaults to localhost when nothing is configured", () => {
    expect(resolveMcpResource(env({}))).toBe("http://localhost:3000/api/mcp");
  });
});
