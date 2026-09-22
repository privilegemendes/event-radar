import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  /* Reads require a session. Middleware redirects on a missing cookie, but that
     only checks the cookie exists — this is where an invalid or expired one is
     actually caught, before anything renders. */
  const session = await getSession();
  if (!session) redirect("/login");
  const role = session.role;

  return (
    <div className="flex h-screen overflow-hidden bg-coder-bg">
      <Sidebar role={role} />
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <TopBar
          name={session.name}
          email={session.email}
          role={role}
          mustChangePassword={session.mustChangePassword}
        />
        <main className="flex-1 overflow-auto p-5 md:p-7">{children}</main>
      </div>
    </div>
  );
}
