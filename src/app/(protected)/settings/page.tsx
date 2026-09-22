"use client";

import { useEffect, useState, FormEvent } from "react";
import WorkspaceSettings from "@/components/WorkspaceSettings";

interface User {
  id: string; email: string; name: string; role: "ADMIN" | "MEMBER";
  mustChangePassword: boolean; createdAt: string;
}

const inputCls =
  "w-full px-3 py-2.5 bg-coder-control border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-coder-purple focus:ring-1 focus:ring-coder-purple transition-colors";
const labelCls =
  "block font-mono text-[9px] uppercase tracking-[0.1em] text-white/40 mb-1.5";

export default function SettingsPage() {
  const [users,   setUsers]   = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const [nu, setNu] = useState({ email: "", name: "", password: "", role: "MEMBER" as "ADMIN" | "MEMBER" });
  const [adding,   setAdding]   = useState(false);
  const [addError, setAddError] = useState("");

  const [me, setMe] = useState<string | null>(null);
  const [roleBusy, setRoleBusy] = useState<string | null>(null);
  const [roleError, setRoleError] = useState("");

  const load = async () => {
    const res = await fetch("/api/users");
    if (res.ok) { setUsers((await res.json()) as User[]); setIsAdmin(true); }
    else setIsAdmin(false);
    setLoading(false);
  };
  useEffect(() => {
    load();
    /* Who I am, so the table can explain why my own role is not editable.
       Matched on email rather than id: /api/auth/me already returns it, email
       is unique here, and several other pages depend on that endpoint's shape. */
    fetch("/api/auth/me").then((r) => r.json()).then((d: { email?: string }) => setMe(d?.email ?? null)).catch(() => {});
  }, []);

  /* The server owns the rules — an admin may not demote themselves, and the
     last admin may not be demoted at all. This only surfaces the refusal; it
     does not decide it, so a stale table cannot talk the server into a change
     it would otherwise reject. */
  const changeRole = async (id: string, role: "ADMIN" | "MEMBER") => {
    setRoleBusy(id); setRoleError("");
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }),
    });
    if (res.ok) await load();
    else { const d = (await res.json()) as { error?: string }; setRoleError(d.error ?? "Could not change the role"); }
    setRoleBusy(null);
  };

  const addUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!nu.email || !nu.name || !nu.password) { setAddError("All fields required"); return; }
    setAdding(true); setAddError("");
    const res = await fetch("/api/users", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nu),
    });
    if (res.ok) { await load(); setNu({ email: "", name: "", password: "", role: "MEMBER" }); setShowAdd(false); }
    else { const d = (await res.json()) as { error?: string }; setAddError(d.error ?? "Failed"); }
    setAdding(false);
  };

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/30 mt-1">Account &amp; user management</p>
      </div>

      {/* Password section */}
      <div className="bg-coder-panel border border-white/[0.08] rounded-xl p-5 mb-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/40 mb-1">Password</p>
        <p className="text-sm text-white/50 mb-4">Keep your account secure with a strong, unique password.</p>
        <a
          href="/change-password"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/8 border border-white/10 hover:border-white/20 text-white/70 hover:text-white text-sm rounded-lg transition-all"
        >
          Change password
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 6h8M7 3l3 3-3 3"/>
          </svg>
        </a>
      </div>

      {/* Shared workspace settings (admin only). The per-speaker profile and
          brief moved to /profile, where every speaker can reach their own. */}
      {!loading && isAdmin && <WorkspaceSettings />}

      {/* Users (admin only) */}
      {!loading && isAdmin && (
        <div className="bg-coder-panel border border-white/[0.08] rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/40">Users</p>
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="px-3 py-1.5 bg-coder-purple hover:bg-coder-purple-hover text-black font-mono text-[9px] uppercase tracking-[0.08em] font-bold rounded-lg transition-colors"
            >
              {showAdd ? "Cancel" : "+ Add user"}
            </button>
          </div>

          {roleError && (
            <div className="mb-4 p-3 bg-coder-coral/10 border border-coder-coral/25 rounded-lg text-coder-coral text-sm flex items-center gap-2">
              <span>✗</span>
              <span>{roleError}</span>
              <button onClick={() => setRoleError("")} className="ml-auto opacity-50 hover:opacity-100 font-mono text-xs">✕</button>
            </div>
          )}

          {showAdd && (
            <form onSubmit={addUser} className="mb-5 p-4 bg-coder-panel border border-white/[0.07] rounded-xl space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelCls}>Email</label>
                  <input type="email" required className={inputCls} value={nu.email} onChange={(e) => setNu((p) => ({ ...p, email: e.target.value }))} placeholder="user@example.com" />
                </div>
                <div>
                  <label className={labelCls}>Name</label>
                  <input type="text" required className={inputCls} value={nu.name} onChange={(e) => setNu((p) => ({ ...p, name: e.target.value }))} placeholder="Full Name" />
                </div>
                <div>
                  <label className={labelCls}>Password</label>
                  <input type="password" required className={inputCls} value={nu.password} onChange={(e) => setNu((p) => ({ ...p, password: e.target.value }))} placeholder="••••••••" />
                </div>
                <div>
                  <label className={labelCls}>Role</label>
                  <select className={inputCls} value={nu.role} onChange={(e) => setNu((p) => ({ ...p, role: e.target.value as "ADMIN" | "MEMBER" }))}>
                    <option value="MEMBER">MEMBER</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </div>
              </div>
              {addError && <p className="font-mono text-[10px] text-coder-coral">{addError}</p>}
              <button type="submit" disabled={adding} className="w-full py-2 bg-coder-purple hover:bg-coder-purple-hover disabled:opacity-50 text-black font-semibold text-sm rounded-lg transition-colors">
                {adding ? "Creating…" : "Create user"}
              </button>
              <p className="font-mono text-[9px] text-white/20 text-center">New users are prompted to change their password on first login.</p>
            </form>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.07]">
                {["Name","Email","Role","Added"].map((h) => (
                  <th key={h} className="text-left py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-white/30">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="py-2.5 text-white/80">
                    {u.name}
                    {u.mustChangePassword && (
                      <span className="ml-2 font-mono text-[8px] text-coder-coral/70">⚠ pw change needed</span>
                    )}
                  </td>
                  <td className="py-2.5 font-mono text-[10px] text-white/40">{u.email}</td>
                  <td className="py-2.5">
                    {u.email === me ? (
                      /* Your own role is fixed here. Demoting yourself takes
                         effect on the next request and needs another admin to
                         undo, so it is not a click away. */
                      <span
                        title="You cannot change your own role"
                        className="font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-coder-purple/15 text-coder-purple border border-coder-purple/25"
                      >
                        {u.role} · you
                      </span>
                    ) : (
                      <select
                        value={u.role}
                        disabled={roleBusy === u.id}
                        onChange={(e) => changeRole(u.id, e.target.value as "ADMIN" | "MEMBER")}
                        aria-label={`Role for ${u.name}`}
                        className={`font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-1 rounded bg-coder-control border cursor-pointer disabled:opacity-40 focus:outline-none focus:border-coder-purple ${
                          u.role === "ADMIN"
                            ? "text-coder-purple border-coder-purple/25"
                            : "text-white/50 border-white/10"
                        }`}
                      >
                        <option value="ADMIN">ADMIN</option>
                        <option value="MEMBER">MEMBER</option>
                      </select>
                    )}
                  </td>
                  <td className="py-2.5 font-mono text-[9px] text-white/25">{fmt(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !isAdmin && (
        <div className="bg-coder-panel border border-white/[0.08] rounded-xl p-5 text-white/40 text-sm">
          Contact an admin to manage users.
        </div>
      )}
    </div>
  );
}
