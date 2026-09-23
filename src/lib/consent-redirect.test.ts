import { consentRedirect } from "./consent-redirect";

describe("consentRedirect", () => {
  /* The regression. This is the shape the plugin actually returns; reading only
     redirectURI/redirect_uri dead-ended every authorization after the person had
     already signed in and approved. Observed in production 2026-09-23. */
  it("reads the `url` field the consent endpoint actually returns", () => {
    expect(consentRedirect({ url: "https://claude.ai/api/mcp/auth_callback?code=abc&state=s" }))
      .toBe("https://claude.ai/api/mcp/auth_callback?code=abc&state=s");
  });

  it("still accepts the camelCase spelling", () => {
    expect(consentRedirect({ redirectURI: "https://claude.ai/cb?code=1" })).toBe("https://claude.ai/cb?code=1");
  });

  it("still accepts the snake_case spelling", () => {
    expect(consentRedirect({ redirect_uri: "https://claude.ai/cb?code=1" })).toBe("https://claude.ai/cb?code=1");
  });

  it("prefers `url` when more than one is present", () => {
    expect(consentRedirect({ url: "https://a.example/cb", redirectURI: "https://b.example/cb" }))
      .toBe("https://a.example/cb");
  });

  it("rejects a relative path, which would navigate inside this app", () => {
    expect(consentRedirect({ url: "/consent" })).toBeUndefined();
  });

  it("falls through a relative value to a later absolute one", () => {
    expect(consentRedirect({ url: "/nope", redirectURI: "https://claude.ai/cb" })).toBe("https://claude.ai/cb");
  });

  it("is undefined for an empty, blank or absent body", () => {
    expect(consentRedirect({})).toBeUndefined();
    expect(consentRedirect({ url: "   " })).toBeUndefined();
    expect(consentRedirect(null)).toBeUndefined();
    expect(consentRedirect(undefined)).toBeUndefined();
  });
});
