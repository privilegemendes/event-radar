import { getSession } from "@/lib/session";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  // Viewing is open to anyone who can reach the app (gated by the Coder proxy).
  // Editing requires an admin session; the UI hides write controls for guests/viewers.
  const session = await getSession();
  const role = session?.role ?? "MEMBER";

  return (
    <div className="flex h-screen overflow-hidden bg-coder-bg">
      <Sidebar role={role} />
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <TopBar
          name={session?.name ?? "Guest"}
          email={session?.email ?? "view-only"}
          role={role}
          mustChangePassword={session?.mustChangePassword ?? false}
          isGuest={!session}
        />
        <main className="flex-1 overflow-auto p-5 md:p-7">{children}</main>
      </div>
    </div>
  );
}
