"use client";

import { useRouter } from "next/navigation";

interface TopBarProps {
  name: string;
  email: string;
  role: "ADMIN" | "MEMBER";
  mustChangePassword: boolean;
  isGuest?: boolean;
}

export default function TopBar({ name, email, role, mustChangePassword, isGuest }: TopBarProps) {
  const router = useRouter();

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <div className="flex-shrink-0">
      {mustChangePassword && (
        <div className="bg-coder-coral/10 border-b border-coder-coral/20 px-4 py-2 text-sm text-coder-coral flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="flex-shrink-0">
            <path d="M7 1L13 12H1L7 1z"/>
            <path d="M7 5v3M7 10h.01"/>
          </svg>
          <span>
            You are using a default password.{" "}
            <a href="/change-password" className="underline font-semibold hover:text-coder-coral/80 transition-colors">
              Change it now
            </a>{" "}
            for security.
          </span>
        </div>
      )}
      <header className="h-12 bg-coder-bg border-b border-white/[0.07] flex items-center justify-between px-4 md:px-5">
        <div className="md:hidden w-8" />
        <div className="hidden md:block" />
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-white/90">{name}</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-white/30">{email}</p>
          </div>
          <span
            className={`font-mono text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded ${
              role === "ADMIN"
                ? "bg-coder-purple/15 text-coder-purple border border-coder-purple/25"
                : "bg-white/5 text-white/40 border border-white/10"
            }`}
          >
            {role}
          </span>
          <button
            onClick={logout}
            className="font-mono text-[10px] uppercase tracking-[0.08em] text-white/40 hover:text-white px-3 py-1.5 rounded border border-white/10 hover:border-white/20 transition-all"
            style={{ display: isGuest ? "none" : undefined }}
          >
            Logout
          </button>
          {isGuest && (
            <a
              href="/login"
              className="font-mono text-[10px] uppercase tracking-[0.08em] text-coder-purple hover:text-coder-purple-hover px-3 py-1.5 rounded border border-coder-purple/30 hover:border-coder-purple/50 transition-all"
            >
              Log in to edit
            </a>
          )}
        </div>
      </header>
    </div>
  );
}
