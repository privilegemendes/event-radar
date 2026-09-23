/**
 * The gate redirects unauthenticated page requests to /login. Files in
 * `public/` are served from the root, so without an explicit carve-out the
 * sign-in page's own logo gets redirected and renders broken — which is
 * exactly what shipped once.
 */
import { middleware } from "@/middleware";

jest.mock("better-auth/cookies", () => ({
  getSessionCookie: () => null, // always signed out
}));

const req = (pathname: string) =>
  ({ nextUrl: new URL(`https://example.test${pathname}`), url: `https://example.test${pathname}`,
     cookies: { get: () => undefined } }) as unknown as Parameters<typeof middleware>[0];

const statusFor = async (pathname: string) => (await middleware(req(pathname))).status;

describe("middleware: static assets are not gated", () => {
  it.each([
    "/event-radar-logo-dark-mode.svg",
    "/world.geojson",
    "/globe.svg",
  ])("serves %s to a signed-out visitor", async (pathname) => {
    expect(await statusFor(pathname)).not.toBe(307);
  });

  it("still redirects a signed-out visitor away from a page", async () => {
    expect(await statusFor("/speakers")).toBe(307);
  });

  it("leaves the public pages reachable", async () => {
    expect(await statusFor("/login")).not.toBe(307);
    expect(await statusFor("/signup")).not.toBe(307);
  });
});
