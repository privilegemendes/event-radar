import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * RFC 8414 authorization server metadata, at the origin root.
 *
 * Better Auth serves this, but under its own base path
 * (/api/auth/.well-known/...). RFC 8414 requires it at the ORIGIN root, and an
 * MCP client looks there and nowhere else, so this forwards rather than
 * duplicating the document — one source of truth, no drift.
 */
export async function GET() {
  const metadata = await auth.api.getOAuthServerConfig();
  return NextResponse.json(metadata, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
