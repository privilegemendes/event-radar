"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EVENT_TYPES, EVENT_STATUSES, REGIONS, CATEGORIES, CATEGORY_LABELS, AUDIENCE_SIGNALS, AUDIENCE_LABELS } from "@/lib/constants";

interface Partner { id: string; name: string; }

const inputCls =
  "w-full px-3 py-2 bg-coder-control border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-coder-purple focus:ring-1 focus:ring-coder-purple transition-colors";
const labelCls =
  "block font-mono text-[9px] uppercase tracking-[0.1em] text-white/40 mb-1.5";

export default function NewEventPage() {
  const router   = useRouter();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  const [form, setForm] = useState({
    title: "", type: "CONFERENCE", status: "DISCOVERED", category: "",
    startDate: "", endDate: "", location: "", isOnline: false, region: "",
    coderRelevant: false, cfpDeadline: "", url: "", contact: "",
    description: "", sourceNote: "", partnerId: "", followUpAt: "",
  });
  const [signals, setSignals] = useState<string[]>([]);
  const toggleSignal = (tag: string) =>
    setSignals((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  useEffect(() => {
    fetch("/api/partners")
      .then((r) => r.json())
      .then((d: Partner[]) => setPartners(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const set = (k: string, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title) { setError("Title is required"); return; }
    setSaving(true); setError("");
    const body = {
      ...form,
      startDate: form.startDate || null, endDate: form.endDate || null,
      cfpDeadline: form.cfpDeadline || null, followUpAt: form.followUpAt || null,
      location: form.location || null, region: form.region || null,
      url: form.url || null, contact: form.contact || null,
      description: form.description || null, sourceNote: form.sourceNote || null,
      partnerId: form.partnerId || null,
      category: form.category || null,
      audienceSignals: signals,
    };
    const res = await fetch("/api/events", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (res.ok) {
      const ev = (await res.json()) as { id: string };
      router.push(`/events/${ev.id}`);
    } else {
      const d = (await res.json()) as { error?: string };
      setError(d.error ?? "Failed to create event");
      setSaving(false);
    }
  };

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div><label className={labelCls}>{label}</label>{children}</div>
  );
  const I = (key: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input className={inputCls} value={form[key as keyof typeof form] as string} onChange={(e) => set(key, e.target.value)} {...props} />
  );
  const S = (key: string, opts: string[], withEmpty = false) => (
    <select className={inputCls} value={form[key as keyof typeof form] as string} onChange={(e) => set(key, e.target.value)}>
      {withEmpty && <option value="">—</option>}
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href="/" className="font-mono text-[10px] uppercase tracking-[0.08em] text-white/30 hover:text-coder-purple transition-colors">← Back</Link>
        <h1 className="text-xl font-semibold text-white mt-2">New Event</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-coder-panel border border-white/[0.08] rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <F label="Title *">{I("title", { required: true, placeholder: "Event name" })}</F>
          <F label="Type *">{S("type", EVENT_TYPES)}</F>
          <F label="Track">
            <select className={inputCls} value={form.category} onChange={(e) => set("category", e.target.value)}>
              <option value="">Auto (from signals)</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </F>
          <F label="Status">{S("status", EVENT_STATUSES)}</F>
          <F label="Partner">
            <select className={inputCls} value={form.partnerId} onChange={(e) => set("partnerId", e.target.value)}>
              <option value="">None</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </F>
          <F label="Start Date">{I("startDate", { type: "date" })}</F>
          <F label="End Date">{I("endDate", { type: "date" })}</F>
          <F label="CFP Deadline">{I("cfpDeadline", { type: "date" })}</F>
          <F label="Follow-up Date">{I("followUpAt", { type: "date" })}</F>
          <F label="Location">{I("location", { placeholder: "Amsterdam, NL" })}</F>
          <F label="Region">{S("region", REGIONS, true)}</F>
          <F label="URL">{I("url", { type: "url", placeholder: "https://…" })}</F>
          <F label="Contact">{I("contact", { placeholder: "name or email" })}</F>
          <F label="Source Note">{I("sourceNote", { placeholder: "How was this discovered?" })}</F>

          <div className="flex gap-5 items-center pt-2">
            {[{ key: "isOnline", label: "Online" }, { key: "coderRelevant", label: "Coder Relevant" }].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form[key as keyof typeof form] as boolean}
                  onChange={(e) => set(key, e.target.checked)}
                  className="w-4 h-4 rounded accent-coder-purple"
                />
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-white/50">{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="bg-coder-panel border border-white/[0.08] rounded-xl p-5">
          <label className={labelCls}>Description</label>
          <textarea
            rows={4}
            className={`${inputCls} resize-none`}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="1–2 sentences about the event…"
          />
        </div>

        <div className="bg-coder-panel border border-white/[0.08] rounded-xl p-5">
          <label className={labelCls}>Audience signals</label>
          <div className="flex flex-wrap gap-1.5">
            {AUDIENCE_SIGNALS.map((tag) => {
              const on = signals.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleSignal(tag)}
                  className={`font-mono text-[10px] uppercase tracking-[0.06em] px-2.5 py-1 rounded-lg border transition-colors ${
                    on
                      ? "bg-coder-purple/20 text-coder-purple border-coder-purple/40"
                      : "bg-white/5 text-white/40 border-white/10 hover:text-white/70 hover:border-white/20"
                  }`}
                >
                  {on ? "✓ " : ""}{AUDIENCE_LABELS[tag]}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-coder-coral/10 border border-coder-coral/25 rounded-lg text-coder-coral text-sm">
            <span>✗</span> {error}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <Link href="/" className="px-4 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-white/40 hover:text-white border border-white/10 hover:border-white/20 rounded-lg transition-colors">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-coder-purple hover:bg-coder-purple-hover disabled:opacity-50 text-black font-semibold text-sm rounded-lg transition-colors"
          >
            {saving ? "Creating…" : "Create Event"}
          </button>
        </div>
      </form>
    </div>
  );
}
