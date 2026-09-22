import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

/**
 * Better Auth's own endpoints (sign-in, sign-out, change-password, get-session).
 *
 * The explicit `/api/auth/me` route still wins over this catch-all — App Router
 * prefers a static segment — which is how the app keeps its own session shape
 * for the client while Better Auth owns everything else under /api/auth.
 */
export const { POST, GET } = toNextJsHandler(auth);
