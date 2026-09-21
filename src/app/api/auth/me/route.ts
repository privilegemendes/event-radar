import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

// Lightweight session probe for the client: is the caller signed in, and what role?
// Used by the inbox so any signed-in Coder reviewer (VIEWER or ADMIN) can approve events.
export async function GET() {
  const session = await getSession();
  return NextResponse.json({
    authenticated: !!session,
    role: session?.role ?? null,
    name: session?.name ?? null,
    email: session?.email ?? null,
  });
}
