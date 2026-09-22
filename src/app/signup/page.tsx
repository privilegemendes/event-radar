"use client";

import { signUp } from "@/lib/auth-client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

/**
 * Self-service account creation.
 *
 * Open: anyone who reaches this page can register. Every new account is a
 * MEMBER — `role` is `input: false` in the auth config, so it cannot be raised
 * by posting one, and only an existing admin can promote afterwards.
 *
 * Worth knowing when deciding who gets the URL: a MEMBER can read the whole
 * event catalogue and the partner CRM. What a MEMBER cannot do is see another
 * speaker's opportunities, run discovery, or manage users.
 */
export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    // Checked here as well as by the server: the mismatch is the one mistake
    // worth catching before a round-trip, because the fields are masked.
    if (password !== confirm) {
      setError("The two passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      const { error } = await signUp.email({ email, password, name });
      if (error) {
        setError(error.message ?? "Could not create the account");
      } else {
        router.push("/profile");
        router.refresh();
      }
    } catch {
      setError("Network error, please try again");
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full px-3.5 py-2.5 bg-coder-control border border-white/10 rounded-lg text-white placeholder-white/20 text-sm focus:outline-none focus:border-coder-purple focus:ring-1 focus:ring-coder-purple transition-colors";
  const labelCls =
    "block font-mono text-[10px] uppercase tracking-[0.1em] text-white/40 mb-1.5";

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-coder-bg px-4 overflow-hidden py-12">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
        <div
          className="w-[640px] h-[400px] rounded-full"
          style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(188,124,255,0.10) 0%, transparent 70%)" }}
        />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/5 border border-white/10 mb-5">
            <Image src="/coder-logo.svg" alt="Coder" width={36} height={36} />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Create your account</h1>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/30 mt-2">
            Event Radar
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className={labelCls}>Name</label>
            <input
              id="name" type="text" value={name} onChange={(e) => setName(e.target.value)}
              required autoComplete="name" className={inputCls} placeholder="Ada Lovelace"
            />
          </div>

          <div>
            <label htmlFor="email" className={labelCls}>Email</label>
            <input
              id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              required autoComplete="email" className={inputCls} placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className={labelCls}>Password</label>
            <input
              id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              required minLength={8} autoComplete="new-password" className={inputCls} placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label htmlFor="confirm" className={labelCls}>Confirm password</label>
            <input
              id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              required minLength={8} autoComplete="new-password" className={inputCls} placeholder="••••••••"
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
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-white/40">
          Already have an account?{" "}
          <Link href="/login" className="text-coder-purple hover:text-coder-purple-hover font-medium transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
