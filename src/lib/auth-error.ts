import { NextResponse } from "next/server";

/**
 * The auth failure type and its HTTP mapping.
 *
 * Kept separate from session.ts so it stays free of the Better Auth import:
 * session.ts pulls in an ESM-only package that Jest cannot load, and these are
 * the parts worth unit-testing. session.ts re-exports both, so route handlers
 * still import them from "@/lib/session".
 */
export class AuthError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export function authErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return null;
}
