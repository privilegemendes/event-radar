"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

const inputCls =
  "w-full px-3.5 py-2.5 bg-[#0D1011] border border-white/10 rounded-lg text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#BC7CFF] focus:ring-1 focus:ring-[#BC7CFF] transition-colors";
const labelCls =
  "block font-mono text-[9px] uppercase tracking-[0.1em] text-white/40 mb-1.5";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword,     setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) { setError("New passwords do not match"); return; }
    if (newPassword.length < 8)         { setError("New password must be at least 8 characters"); return; }
    setLoading(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (res.ok) {
      setSuccess(true);
      setTimeout(() => router.push("/"), 1500);
    } else {
      const d = (await res.json()) as { error?: string };
      setError(d.error ?? "Failed to change password");
    }
    setLoading(false);
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Change Password</h1>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/30 mt-1">Update your account password</p>
      </div>

      {success ? (
        <div className="flex items-center gap-3 p-4 bg-[#66FFAB]/10 border border-[#66FFAB]/25 rounded-xl text-[#66FFAB] text-sm">
          <span className="text-lg">✓</span>
          <span>Password changed successfully. Redirecting…</span>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-[#101314] border border-white/[0.08] rounded-xl p-6 space-y-4">
          {[
            { label: "Current Password",     value: currentPassword, set: setCurrentPassword, ac: "current-password" },
            { label: "New Password",         value: newPassword,     set: setNewPassword,     ac: "new-password" },
            { label: "Confirm New Password", value: confirmPassword, set: setConfirmPassword, ac: "new-password" },
          ].map(({ label, value, set, ac }) => (
            <div key={label}>
              <label className={labelCls}>{label}</label>
              <input
                type="password"
                required
                autoComplete={ac}
                value={value}
                onChange={(e) => set(e.target.value)}
                className={inputCls}
                placeholder="••••••••"
              />
            </div>
          ))}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-[#FF8067]/10 border border-[#FF8067]/25 rounded-lg text-[#FF8067] text-sm">
              <span>✗</span> {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 py-2.5 border border-white/10 text-white/40 hover:text-white hover:border-white/20 text-sm rounded-lg transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 bg-[#BC7CFF] hover:bg-[#CA96FF] disabled:opacity-50 text-black font-semibold text-sm rounded-lg transition-colors"
            >
              {loading ? "Saving…" : "Change password"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
