import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveAnthropic, messagesUrl, OFFICIAL_BASE_URL, WEB_SEARCH_BETA } from "./anthropic";

describe("resolveAnthropic", () => {
  it("returns null when no key is configured", () => {
    expect(resolveAnthropic({})).toBeNull();
    expect(resolveAnthropic({ ANTHROPIC_BASE_URL: "https://gw.example" })).toBeNull();
  });

  it("treats a blank or whitespace key as absent", () => {
    // An env var set to "" is how a half-configured deploy fails, and it must
    // read as "not configured" rather than sending an empty credential.
    expect(resolveAnthropic({ ANTHROPIC_API_KEY: "" })).toBeNull();
    expect(resolveAnthropic({ ANTHROPIC_AUTH_TOKEN: "   " })).toBeNull();
  });

  it("accepts ANTHROPIC_API_KEY, the name Anthropic and every SDK use", () => {
    const c = resolveAnthropic({ ANTHROPIC_API_KEY: "sk-ant-test" })!;
    expect(c.headers["x-api-key"]).toBe("sk-ant-test");
  });

  it("still accepts ANTHROPIC_AUTH_TOKEN, so existing deploys keep working", () => {
    const c = resolveAnthropic({ ANTHROPIC_AUTH_TOKEN: "gateway-token" })!;
    expect(c.headers["x-api-key"]).toBe("gateway-token");
  });

  it("prefers AUTH_TOKEN when both are set", () => {
    // Someone who set AUTH_TOKEN chose it for a non-default endpoint; a
    // stray API_KEY should not silently take over.
    const c = resolveAnthropic({ ANTHROPIC_AUTH_TOKEN: "chosen", ANTHROPIC_API_KEY: "sk-ant-other" })!;
    expect(c.headers["x-api-key"]).toBe("chosen");
  });

  it("defaults to the official API so a key alone is enough", () => {
    expect(resolveAnthropic({ ANTHROPIC_API_KEY: "k" })!.baseUrl).toBe(OFFICIAL_BASE_URL);
  });

  it("sends no bearer header to the official API", () => {
    // It authenticates on x-api-key; a second credential header is at best
    // ignored and at worst a conflict.
    const c = resolveAnthropic({ ANTHROPIC_API_KEY: "k" })!;
    expect(c.headers.Authorization).toBeUndefined();
  });

  it("sends a bearer header to a gateway, which commonly wants one", () => {
    const c = resolveAnthropic({ ANTHROPIC_AUTH_TOKEN: "t", ANTHROPIC_BASE_URL: "https://gw.example/api" })!;
    expect(c.headers.Authorization).toBe("Bearer t");
    expect(c.headers["x-api-key"]).toBe("t");
  });

  it("always carries the API version", () => {
    expect(resolveAnthropic({ ANTHROPIC_API_KEY: "k" })!.headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("adds the beta header only when asked", () => {
    expect(resolveAnthropic({ ANTHROPIC_API_KEY: "k" })!.headers["anthropic-beta"]).toBeUndefined();
    expect(resolveAnthropic({ ANTHROPIC_API_KEY: "k" }, { beta: WEB_SEARCH_BETA })!.headers["anthropic-beta"]).toBe(WEB_SEARCH_BETA);
  });

  it("strips trailing slashes so the URL never doubles up", () => {
    const c = resolveAnthropic({ ANTHROPIC_API_KEY: "k", ANTHROPIC_BASE_URL: "https://gw.example/api///" })!;
    expect(messagesUrl(c)).toBe("https://gw.example/api/v1/messages");
  });

  it("builds the messages URL for the official API", () => {
    expect(messagesUrl(resolveAnthropic({ ANTHROPIC_API_KEY: "k" })!)).toBe("https://api.anthropic.com/v1/messages");
  });
});

/**
 * Guard against a half-finished centralisation.
 *
 * The first pass moved discovery, scoring and analyze onto resolveAnthropic and
 * left four routes reading the env directly. Nothing failed at build time — the
 * gap only showed when a key was configured under the new name and those four
 * answered 503 while scoring worked. This reads the sources so a call site
 * added later cannot quietly reintroduce it.
 */
describe("every Anthropic call site uses the shared config", () => {
  function sources(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...sources(full));
      else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(full);
    }
    return out;
  }

  const files = sources(join(process.cwd(), "src")).filter((f) => !f.endsWith("lib/anthropic.ts"));

  it("finds the source files to check", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("reads ANTHROPIC_* only through resolveAnthropic", () => {
    const offenders = files.filter((f) => /process\.env\.ANTHROPIC_/.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => f.replace(process.cwd() + "/", ""))).toEqual([]);
  });
});
