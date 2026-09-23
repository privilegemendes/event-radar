"use client";

import { signIn } from "@/lib/auth-client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error } = await signIn.email({ email, password });
      if (error) {
        // Better Auth returns a generic message for a bad email or password;
        // keep the existing wording so the copy does not leak which was wrong.
        setError(error.message ?? "Invalid credentials");
      } else {
        /* An OAuth authorization in progress lands here carrying its own signed
           query (client_id, redirect_uri, code_challenge, sig…). Sending those
           back to /oauth2/authorize is what resumes the flow and returns the
           person to the client that sent them; pushing "/" instead would sign
           them in and strand them on the dashboard, which is how a connector
           appears to hang. */
        const params = new URLSearchParams(window.location.search);
        if (params.has("client_id")) {
          /* A hard navigation, deliberately. The target is an API route that
             answers with a 302 to the client's redirect_uri; router.push()
             would try to client-side route to it and never leave the app. */
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = `/api/auth/oauth2/authorize?${params.toString()}`;
          return;
        }
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Network error, please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-coder-bg px-4 overflow-hidden">

      {/* Subtle purple radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 flex justify-center"
      >
        <div
          className="w-[640px] h-[400px] rounded-full"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, rgba(188,124,255,0.10) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* Card */}
      <div className="relative w-full max-w-sm">

        {/* Logo + headings */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/5 border border-white/10 mb-5">
            <Image src="/event-radar-logo-dark-mode.svg" alt="" width={36} height={36} />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Event Radar
          </h1>

        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block font-mono text-[10px] uppercase tracking-[0.1em] text-white/40 mb-1.5"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3.5 py-2.5 bg-coder-control border border-white/10 rounded-lg text-white placeholder-white/20 text-sm focus:outline-none focus:border-coder-purple focus:ring-1 focus:ring-coder-purple transition-colors"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block font-mono text-[10px] uppercase tracking-[0.1em] text-white/40 mb-1.5"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3.5 py-2.5 bg-coder-control border border-white/10 rounded-lg text-white placeholder-white/20 text-sm focus:outline-none focus:border-coder-purple focus:ring-1 focus:ring-coder-purple transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-coder-coral/10 border border-coder-coral/25 rounded-lg text-coder-coral text-sm">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="flex-shrink-0">
                <circle cx="7" cy="7" r="6"/>
                <path d="M7 4v3M7 10h.01"/>
              </svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-coder-purple hover:bg-coder-purple-hover active:bg-coder-purple-active disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold text-sm rounded-lg transition-colors mt-2"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-white/40">
          No account yet?{" "}
          <Link href="/signup" className="text-coder-purple hover:text-coder-purple-hover font-medium transition-colors">
            Create one
          </Link>
        </p>

      </div>
    </div>
  );
}
