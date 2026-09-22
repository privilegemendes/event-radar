import { SignJWT, jwtVerify } from "jose";

export interface Session {
  userId: string;
  email: string;
  name: string;
  role: "ADMIN" | "MEMBER";
  mustChangePassword: boolean;
}

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET env var is not set");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: Session): Promise<string> {
  return new SignJWT({ ...(payload as unknown as Record<string, unknown>) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}
