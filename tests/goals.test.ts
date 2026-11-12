import { describe, expect, it } from "vitest";
import { computeGoalProgress, expectedProgress, goalDepth, goalHealth, wouldCreateGoalCycle } from "@/lib/goals";

const d = (s: string) => new Date(s);

describe("goal progress", () => {
  it("averages projects, tasks and sub-goals equally", () => {
    expect(computeGoalProgress([{ kind: "project", total: 4, done: 1 }, { kind: "task", completed: true }])).toBe(63);
    expect(computeGoalProgress([{ kind: "goal", progress: 50 }, { kind: "goal", progress: 100 }])).toBe(75);
  });
  it("skips empty projects and falls back to manual progress", () => {
    expect(computeGoalProgress([{ kind: "project", total: 0, done: 0 }], 40)).toBe(40);
    expect(computeGoalProgress([])).toBe(0);
    expect(computeGoalProgress([], 140)).toBe(100);
  });
  it("ignores manual progress once something is linked", () => {
    expect(computeGoalProgress([{ kind: "task", completed: false }], 90)).toBe(0);
  });
});

describe("goal health", () => {
  const start = d("2026-11-01T00:00:00Z");
  const due = d("2026-11-11T00:00:00Z");
  const now = d("2026-11-06T00:00:00Z"); // halfway
  it("computes expected progress from the timeline", () => {
    expect(expectedProgress(start, due, now)).toBe(50);
    expect(expectedProgress(start, null, now)).toBeNull();
  });
  it("on track / at risk / off track by gap to expected", () => {
    expect(goalHealth({ progress: 40, startDate: start, dueDate: due, now })).toBe("ON_TRACK");
    expect(goalHealth({ progress: 25, startDate: start, dueDate: due, now })).toBe("AT_RISK");
    expect(goalHealth({ progress: 5, startDate: start, dueDate: due, now })).toBe("OFF_TRACK");
  });
  it("achieved at 100%, off track after due date, override wins", () => {
    expect(goalHealth({ progress: 100, startDate: start, dueDate: due, now })).toBe("ACHIEVED");
    expect(goalHealth({ progress: 90, startDate: start, dueDate: due, now: d("2026-11-12T00:00:00Z") })).toBe("OFF_TRACK");
    expect(goalHealth({ progress: 0, startDate: start, dueDate: due, now, statusOverride: "ON_TRACK" })).toBe("ON_TRACK");
    expect(goalHealth({ progress: 0, startDate: start, dueDate: null, now })).toBe("ON_TRACK");
  });
});

describe("goal tree", () => {
  const parents = new Map<string, string | null>([["a", null], ["b", "a"], ["c", "b"]]);
  it("detects cycles", () => {
    expect(wouldCreateGoalCycle("a", "c", parents)).toBe(true);
    expect(wouldCreateGoalCycle("c", "a", parents)).toBe(false);
  });
  it("measures depth", () => {
    expect(goalDepth(null, parents)).toBe(0);
    expect(goalDepth("c", parents)).toBe(3);
  });
});
