import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { createMcpProtectedRequestHandler } from "@better-auth/mcp";
import { MCP_RESOURCE } from "@/lib/auth";
import { registerEventRadarTools } from "@/lib/mcp-tools";
import { isAdminUser } from "@/lib/user-role";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * The MCP endpoint, and the protected resource the OAuth metadata points at.
 *
 * POST only, deliberately. The modern MCP protocol handles each request
 * independently, so there is no SSE stream to hold open and no session store to
 * keep — which is what makes this viable on serverless at all. `legacy:
 * "reject"` refuses the old transport rather than silently falling back to a
 * stateful mode this deployment cannot support.
 *
 * createMcpProtectedRequestHandler verifies the bearer token against our own
 * JWKS, audience-bound to MCP_RESOURCE. An unauthenticated request gets a 401
 * with a WWW-Authenticate challenge, which is how a connector discovers where
 * to send the person to log in.
 *
 * `sub` is the Better Auth user id, and it reaches the tools as per-request
 * authInfo rather than through a closure, so ONE handler serves every user
 * without leaking identity between requests. The tools then act as the person
 * who granted consent, never a shared service identity — which is the whole
 * reason this replaced the stdio server.
 */
const ORIGIN = new URL(MCP_RESOURCE).origin;
const ISSUER = `${ORIGIN}/api/auth`;

/* Better Auth serves its JWKS at /api/auth/jwks, not the RFC-conventional
   <issuer>/.well-known/jwks.json the verifier would otherwise assume. Without
   this the token verifies against nothing and every call fails with
   "no token payload" — a 401 that looks like a bad token rather than a
   misconfigured verifier. The value matches `jwks_uri` in the published
   authorization server metadata. */
const JWKS_URL = `${ISSUER}/jwks`;

/** Built once. Per-request identity arrives via `authInfo`, read off ctx below. */
const mcpHandler = createMcpHandler(
  (ctx) => {
    const userId = ctx.authInfo?.extra?.userId;
    if (typeof userId !== "string" || !userId) {
      // Unreachable in practice: the wrapper below rejects a token with no
      // subject before the factory runs. Fail loudly rather than serving tools
      // scoped to nobody.
      throw new Error("MCP request reached the server with no authenticated user");
    }
    const server = new McpServer({ name: "event-radar", version: "0.1.0" });
    /* The factory may be async, which is what lets the role be read before the
       tool list is built — a member never sees the shared-catalogue tools at
       all, rather than seeing them and being refused. */
    return isAdminUser(userId).then((isAdmin) => {
      registerEventRadarTools(server, userId, isAdmin);
      return server;
    });
  },
  { legacy: "reject" },
);

const handler = createMcpProtectedRequestHandler(
  { issuer: ISSUER, audience: MCP_RESOURCE, jwksUrl: JWKS_URL },
  async (request, claims) => {
    const userId = typeof claims.sub === "string" ? claims.sub : null;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Token carries no subject" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    return mcpHandler.fetch(request, {
      authInfo: {
        token: "",                                  // already verified; not re-read downstream
        clientId: typeof claims.client_id === "string" ? claims.client_id : "",
        scopes: typeof claims.scope === "string" ? claims.scope.split(" ") : [],
        extra: { userId },
      },
    });
  },
);

export async function POST(request: Request) {
  return handler(request);
}
