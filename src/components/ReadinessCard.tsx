"use client";

import { useRef, useState } from "react";
import EventAvatar from "./EventAvatar";
import type { ChecklistItem, StageItem } from "@/lib/constants";

export interface CustomTask { id: string; label: string; done: boolean; }

interface ReadinessEvent {
  id: string;
  title: string;
  type: string;
  url?: string | null;
  startDate: string | null;
  endDate?: string | null;
  location: string | null;
  isOnline: boolean;
  readiness: string | null;
  prepStage?: string | null;
  customTasks?: string | null;
}

interface ReadinessCardProps {
  event: ReadinessEvent;
  checklist: ChecklistItem[];
  stages: StageItem[];
  /** "#BC7CFF" for speaking gigs, "#01F2FF" for attending */
  accent: "#BC7CFF" | "#01F2FF";
  isAdmin: boolean;
  onReadinessChange?: (id: string, next: Record<string, boolean>) => void;
  onPrepStageChange?: (id: string, stage: string | null) => void;
  onCustomTasksChange?: (id: string, tasks: CustomTask[]) => void;
}

/* ── Parsers ── */
function parseReadiness(raw: string | null): Record<string, boolean> {
  try { return JSON.parse(raw ?? "{}") as Record<string, boolean>; } catch { return {}; }
}
function parseCustomTasks(raw: string | null): CustomTask[] {
  try { return JSON.parse(raw ?? "[]") as CustomTask[]; } catch { return []; }
}

/* ── Progress color ── */
function progressColor(done: number, total: number): string {
  if (total === 0) return "#01F2FF";
  const pct = done / total;
  if (pct >= 1)   return "#66FFAB";
  if (pct >= 0.5) return "#01F2FF";
  return "#FF8067";
}

function fmtDate(d: string | null): string {
  if (!d) return "Date TBD";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

async function save(id: string, body: Record<string, unknown>) {
  await fetch(`/api/events/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export default function ReadinessCard({
  event, checklist, stages, accent, isAdmin,
  onReadinessChange, onPrepStageChange, onCustomTasksChange,
}: ReadinessCardProps) {

  /* ── Stage ── */
  const [prepStage,   setPrepStage]   = useState<string | null>(event.prepStage ?? null);
  const [stageSaving, setStageSaving] = useState(false);

  const setStage = async (key: string) => {
    if (!isAdmin || stageSaving) return;
    const next = prepStage === key ? null : key; // clicking active stage clears it
    setPrepStage(next);
    setStageSaving(true);
    try {
      await save(event.id, { prepStage: next });
      onPrepStageChange?.(event.id, next);
    } finally { setStageSaving(false); }
  };

  /* ── Template checklist ── */
  const [readinessState, setReadinessState] = useState(() => parseReadiness(event.readiness));
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const toggleTemplate = async (key: string) => {
    if (!isAdmin) return;
    const next = { ...readinessState, [key]: !readinessState[key] };
    setReadinessState(next);
    setSavingKey(key);
    try {
      await save(event.id, { readiness: JSON.stringify(next) });
      onReadinessChange?.(event.id, next);
    } finally { setSavingKey(null); }
  };

  /* ── Custom tasks ── */
  const [customTasks,  setCustomTasks]  = useState<CustomTask[]>(() => parseCustomTasks(event.customTasks ?? null));
  const [newLabel,     setNewLabel]     = useState("");
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  const persistCustomTasks = async (next: CustomTask[]) => {
    await save(event.id, { customTasks: JSON.stringify(next) });
    onCustomTasksChange?.(event.id, next);
  };

  const toggleCustom = async (taskId: string) => {
    if (!isAdmin) return;
    const next = customTasks.map((t) => t.id === taskId ? { ...t, done: !t.done } : t);
    setCustomTasks(next);
    setSavingTaskId(taskId);
    try { await persistCustomTasks(next); }
    finally { setSavingTaskId(null); }
  };

  const addTask = async () => {
    const label = newLabel.trim();
    if (!label || !isAdmin) return;
    const next = [...customTasks, { id: `${Date.now()}`, label, done: false }];
    setCustomTasks(next);
    setNewLabel("");
    await persistCustomTasks(next);
  };

  const deleteTask = async (taskId: string) => {
    if (!isAdmin) return;
    const next = customTasks.filter((t) => t.id !== taskId);
    setCustomTasks(next);
    await persistCustomTasks(next);
  };

  /* ── Progress ── */
  const templateDone = checklist.filter((c) => readinessState[c.key]).length;
  const customDone   = customTasks.filter((t) => t.done).length;
  const totalDone    = templateDone + customDone;
  const total        = checklist.length + customTasks.length;
  const pct          = total > 0 ? (totalDone / total) * 100 : 0;
  const pColor       = progressColor(totalDone, total);

  /* ── Stage index helpers ── */
  const activeIdx = stages.findIndex((s) => s.key === prepStage);

  return (
    <div className="bg-[#101314] rounded-xl p-4" style={{ border: `1px solid ${accent}18` }}>

      {/* ── Header: avatar + title + date + progress ── */}
      <div className="flex items-start gap-3 mb-3">
        <EventAvatar event={event} size={40} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-white/90 text-sm leading-snug truncate">{event.title}</p>
          <p className="font-mono text-[9px] text-white/30 mt-0.5">
            {fmtDate(event.startDate)}
            {event.endDate && event.endDate !== event.startDate && <> → {fmtDate(event.endDate)}</>}
            {event.location && ` · ${event.location}`}
            {event.isOnline && !event.location && " · Online"}
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          <span className="font-mono text-[10px] font-bold block" style={{ color: pColor }}>
            {totalDone}/{total} ready
          </span>
          <div className="w-20 h-1 bg-white/10 rounded-full mt-1 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: pColor }} />
          </div>
        </div>
      </div>

      {/* ── Stage stepper ── */}
      {stages.length > 0 && (
        <div className="mb-3 -mx-1 overflow-x-auto">
          <div className="flex items-center gap-0.5 px-1 pb-0.5">
            {stages.map((stage, i) => {
              const isActive = stage.key === prepStage;
              const isPast   = activeIdx > -1 && i < activeIdx;
              return (
                <div key={stage.key} className="flex items-center flex-shrink-0">
                  <button
                    onClick={() => setStage(stage.key)}
                    disabled={!isAdmin || stageSaving}
                    title={isAdmin ? (isActive ? "Click to clear stage" : `Set stage: ${stage.label}`) : stage.label}
                    className={`font-mono text-[9px] uppercase tracking-[0.06em] px-2.5 py-1 rounded-md transition-all disabled:cursor-default ${
                      isAdmin && !isActive ? "hover:opacity-80" : ""
                    }`}
                    style={
                      isActive ? { background: accent, color: "#000", fontWeight: 700 } :
                      isPast   ? { background: `${accent}28`, color: accent, opacity: 0.6 } :
                                 { color: "rgba(255,255,255,0.25)" }
                    }
                  >
                    {stage.label}
                  </button>
                  {i < stages.length - 1 && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="text-white/15 mx-0.5 flex-shrink-0">
                      <path d="M3 2l4 3-4 3"/>
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Template checklist ── */}
      <div className="space-y-0.5 mb-2">
        {checklist.map((item) => {
          const checked    = !!readinessState[item.key];
          const isSaving   = savingKey === item.key;
          return (
            <div
              key={item.key}
              onClick={() => toggleTemplate(item.key)}
              className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors ${isAdmin ? "cursor-pointer hover:bg-white/[0.03]" : ""}`}
            >
              <Checkbox checked={checked} accent={accent} />
              <span className={`text-sm transition-colors flex-1 ${checked ? "text-white/35 line-through decoration-white/20" : "text-white/75"}`}>
                {item.label}
              </span>
              {isSaving && <span className="font-mono text-[9px] text-white/25 animate-pulse">saving…</span>}
            </div>
          );
        })}
      </div>

      {/* ── Custom tasks ── */}
      {(customTasks.length > 0 || isAdmin) && (
        <div className="border-t border-white/[0.06] pt-2 space-y-0.5">
          {customTasks.map((task) => {
            const isSaving = savingTaskId === task.id;
            return (
              <div
                key={task.id}
                className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors group ${isAdmin ? "cursor-pointer hover:bg-white/[0.03]" : ""}`}
                onClick={() => toggleCustom(task.id)}
              >
                <Checkbox checked={task.done} accent={accent} />
                <span className={`text-sm transition-colors flex-1 ${task.done ? "text-white/35 line-through decoration-white/20" : "text-white/75"}`}>
                  {task.label}
                </span>
                {isSaving && <span className="font-mono text-[9px] text-white/25 animate-pulse">saving…</span>}
                {isAdmin && !isSaving && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                    className="opacity-0 group-hover:opacity-100 text-white/25 hover:text-[#FF8067] transition-all ml-1 flex-shrink-0"
                    title="Delete task"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M2 2l8 8M10 2l-8 8"/>
                    </svg>
                  </button>
                )}
              </div>
            );
          })}

          {/* Add task row */}
          {isAdmin && (
            <div className="flex items-center gap-2 px-2 pt-1">
              <div className="w-4 h-4 rounded flex-shrink-0 border border-dashed border-white/15" />
              <input
                ref={addInputRef}
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTask(); } }}
                placeholder="+ Add task…"
                className="flex-1 bg-transparent text-sm text-white/50 placeholder-white/20 focus:outline-none focus:text-white/80 transition-colors"
              />
              {newLabel.trim() && (
                <button onClick={addTask} className="font-mono text-[9px] text-white/40 hover:text-white px-2 py-1 rounded transition-colors">
                  Add
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Shared checkbox sub-component ── */
function Checkbox({ checked, accent }: { checked: boolean; accent: string }) {
  return (
    <div
      className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center transition-all"
      style={{
        background: checked ? accent : "rgba(255,255,255,0.05)",
        border:     checked ? `1px solid ${accent}` : "1px solid rgba(255,255,255,0.15)",
      }}
    >
      {checked && (
        <svg width="9" height="7" viewBox="0 0 9 7" fill="none" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 3.5L3.5 6 8 1"/>
        </svg>
      )}
    </div>
  );
}
