import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isOwner } from "@/lib/owner";

/**
 * The Podium is owner-only, and this is where that is actually enforced.
 *
 * Middleware used to verify the session itself, but under Better Auth it only
 * checks that a session cookie exists — deliberately, to keep a database call
 * off every request. So the real check has to live server-side here, where the
 * session can be read and verified before anything renders.
 */
export default async function PodiumsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isOwner(session)) redirect("/");
  return <>{children}</>;
}
