import { AuthError, authErrorResponse } from "./auth-error";

/**
 * Covers the contract the 16 converted route handlers depend on. getSession /
 * requireSession / requireAdmin themselves need next/headers cookies() and a
 * request scope, so they are exercised by the routes rather than here.
 */
describe("AuthError", () => {
  it("carries the status the route should answer with", () => {
    expect(new AuthError("Not authenticated", 401).status).toBe(401);
    expect(new AuthError("Forbidden", 403).status).toBe(403);
  });

  it("is a real Error, so existing catch blocks still see it", () => {
    const err = new AuthError("Not authenticated", 401);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AuthError");
  });

  it("keeps the exact message the old inline checks used", () => {
    // Back-compat: routes not yet converted still compare on this string.
    const err: unknown = new AuthError("Not authenticated", 401);
    expect(err instanceof Error && err.message === "Not authenticated").toBe(true);
  });
});

describe("authErrorResponse", () => {
  it("maps an unauthenticated error to 401 with the same body as before", async () => {
    const res = authErrorResponse(new AuthError("Not authenticated", 401));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
    await expect(res!.json()).resolves.toEqual({ error: "Not authenticated" });
  });

  it("maps a forbidden error to 403 with the same body as before", async () => {
    const res = authErrorResponse(new AuthError("Forbidden", 403));
    expect(res!.status).toBe(403);
    await expect(res!.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("returns null for anything else so the caller falls through to its 500", () => {
    expect(authErrorResponse(new Error("Prisma exploded"))).toBeNull();
    expect(authErrorResponse("a string")).toBeNull();
    expect(authErrorResponse(null)).toBeNull();
    expect(authErrorResponse(undefined)).toBeNull();
  });

  it("does not swallow a non-auth error that merely looks like one", () => {
    // A plain Error with the same message is NOT an AuthError and must not
    // be turned into a 401 — otherwise a bug could masquerade as a logout.
    expect(authErrorResponse(new Error("Not authenticated"))).toBeNull();
  });
});
