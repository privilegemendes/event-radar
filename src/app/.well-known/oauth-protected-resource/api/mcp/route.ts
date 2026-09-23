import { NextResponse } from "next/server";
import { MCP_RESOURCE } from "@/lib/auth";

/**
 * RFC 9728 protected resource metadata for the MCP endpoint.
 *
 * The path mirrors the resource's own path: the resource is
 * <origin>/api/mcp, so its metadata is
 * <origin>/.well-known/oauth-protected-resource/api/mcp. That is how a client
 * finds which authorization server guards this resource, and it is the first
 * request a custom connector makes — before it has any token.
 *
 * `authorization_servers` points at the origin root rather than Better Auth's
 * base path, because that is where the RFC 8414 document is served from (see
 * the sibling oauth-authorization-server route).
 */
export function GET() {
  const origin = new URL(MCP_RESOURCE).origin;
  return NextResponse.json(
    {
      resource: MCP_RESOURCE,
      authorization_servers: [origin],
      bearer_methods_supported: ["header"],
      scopes_supported: ["openid", "profile", "email", "offline_access"],
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
