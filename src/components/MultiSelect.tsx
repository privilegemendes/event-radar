"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Compact multi-select dropdown: a button showing the current selection count
 * and a checkbox popover. An empty selection means "all".
 */
export default function MultiSelect({
  label,
  options,
  selected,
  onChange,
  labels,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  labels?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const toggle = (opt: string) =>
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);

  const disp = (o: string) => labels?.[o] ?? o;
  const summary = selected.length === 0 ? label : selected.length === 1 ? disp(selected[0]) : `${label}: ${selected.length}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 bg-coder-control border rounded-lg text-sm transition-colors ${
          selected.length ? "border-coder-purple text-white" : "border-white/10 text-white/80"
        }`}
      >
        <span className="whitespace-nowrap">{summary}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 3.5L5 6.5L8 3.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 min-w-[190px] max-h-72 overflow-auto bg-coder-control border border-white/15 rounded-lg p-1 shadow-xl">
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-left px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-white/40 hover:text-white/80"
            >
              Clear
            </button>
          )}
          {options.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-white/5 text-sm text-white/80"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                className="accent-coder-purple"
              />
              <span className="truncate">{disp(opt)}</span>
            </label>
          ))}
          {options.length === 0 && <div className="px-2 py-1.5 text-white/30 text-sm">None</div>}
        </div>
      )}
    </div>
  );
}
