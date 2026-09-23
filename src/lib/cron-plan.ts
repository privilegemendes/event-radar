/**
 * Whether the scheduled run should do a discovery pass.
 *
 * Pure, so the one rule that was wrong can be tested: the auto-discovery toggle
 * governs DISCOVERY ONLY. It used to return early from the whole handler, so
 * turning discovery off also turned scoring off, and "stop paying for web
 * search but keep judging the catalogue we already have" could not be expressed.
 *
 * Scoring is not represented here because it has no condition — it runs on
 * every invocation. That absence is the fix.
 */

export interface CronInputs {
  /** The auto_discovery_enabled AppSetting. */
  enabled: boolean;
  /** The most recent DiscoveryRun, if any. */
  recentRun?: { status: string; startedAt: Date | string } | null;
  now?: Date;
}

export type DiscoveryPlan = { run: true } | { run: false; reason: string };

/** How fresh a RUNNING row has to be to count as still in flight. */
export const OVERLAP_WINDOW_MS = 10 * 60 * 1000;

export function planDiscovery({ enabled, recentRun, now = new Date() }: CronInputs): DiscoveryPlan {
  if (!enabled) return { run: false, reason: "auto-discovery disabled" };

  if (recentRun && recentRun.status === "RUNNING") {
    const started = recentRun.startedAt instanceof Date ? recentRun.startedAt : new Date(recentRun.startedAt);
    const age = now.getTime() - started.getTime();
    /* A RUNNING row older than the window is treated as abandoned rather than
       in flight — a crashed pass leaves one behind forever, and blocking on it
       would stop discovery permanently with no error anywhere. */
    if (age >= 0 && age < OVERLAP_WINDOW_MS) return { run: false, reason: "a run is already in progress" };
  }

  return { run: true };
}
