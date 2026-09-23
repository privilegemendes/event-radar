import { planDiscovery, OVERLAP_WINDOW_MS } from "./cron-plan";

const NOW = new Date("2026-09-23T09:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("planDiscovery", () => {
  it("runs when enabled and nothing is in flight", () => {
    expect(planDiscovery({ enabled: true, now: NOW })).toEqual({ run: true });
  });

  it("skips discovery when the toggle is off", () => {
    expect(planDiscovery({ enabled: false, now: NOW })).toEqual({
      run: false, reason: "auto-discovery disabled",
    });
  });

  it("skips while a run started inside the overlap window", () => {
    const plan = planDiscovery({ enabled: true, now: NOW, recentRun: { status: "RUNNING", startedAt: ago(60_000) } });
    expect(plan).toEqual({ run: false, reason: "a run is already in progress" });
  });

  it("ignores a RUNNING row older than the window", () => {
    // A crashed pass leaves RUNNING behind forever; blocking on it would stop
    // discovery permanently with nothing reporting why.
    expect(planDiscovery({ enabled: true, now: NOW, recentRun: { status: "RUNNING", startedAt: ago(OVERLAP_WINDOW_MS + 1) } })).toEqual({ run: true });
  });

  it("ignores a finished run however recent", () => {
    for (const status of ["DONE", "ERROR"]) {
      expect(planDiscovery({ enabled: true, now: NOW, recentRun: { status, startedAt: ago(1000) } })).toEqual({ run: true });
    }
  });

  it("accepts an ISO string startedAt, as JSON carries", () => {
    const plan = planDiscovery({ enabled: true, now: NOW, recentRun: { status: "RUNNING", startedAt: ago(60_000).toISOString() } });
    expect(plan.run).toBe(false);
  });

  it("does not block on a run whose timestamp is in the future", () => {
    // Clock skew should not wedge discovery shut.
    expect(planDiscovery({ enabled: true, now: NOW, recentRun: { status: "RUNNING", startedAt: ago(-60_000) } })).toEqual({ run: true });
  });

  it("has no say over scoring at all", () => {
    // The whole point: scoring has no condition to plan. If this module ever
    // grows one, the toggle is gating it again.
    expect(Object.keys(planDiscovery({ enabled: false, now: NOW }))).toEqual(["run", "reason"]);
  });
});
