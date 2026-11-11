import { describe, expect, it } from "vitest";
import { computeInsights, localDayKey, weekStartKey, type InsightTask } from "@/lib/insights";

// Wed 11 Nov 2026, 10:00 IST
const now = new Date("2026-11-11T04:30:00Z");
const IST = -330;

function task(p: Partial<InsightTask>): InsightTask {
  return { status: "PENDING", dueDate: null, completedAt: null, createdAt: "2026-11-02T06:00:00Z", projectId: null, assigneeIds: [], ...p };
}

describe("insights helpers", () => {
  it("localDayKey uses the viewer offset", () => {
    expect(localDayKey("2026-11-10T20:00:00Z", IST)).toBe("2026-11-11");
    expect(localDayKey("2026-11-10T20:00:00Z", 0)).toBe("2026-11-10");
  });
  it("weekStartKey returns the Monday", () => {
    expect(weekStartKey("2026-11-11")).toBe("2026-11-09");
    expect(weekStartKey("2026-11-09")).toBe("2026-11-09");
    expect(weekStartKey("2026-11-15")).toBe("2026-11-09");
  });
});

describe("computeInsights", () => {
  const tasks: InsightTask[] = [
    task({ status: "PENDING", dueDate: "2026-11-05T00:00:00Z", assigneeIds: ["u1"], projectId: "p1" }), // overdue
    task({ status: "IN_PROGRESS", dueDate: "2026-11-13T00:00:00Z", assigneeIds: ["u1", "u2"], projectId: "p1" }), // due this week
    task({ status: "PENDING", dueDate: "2026-11-11T00:00:00Z", projectId: "p2" }), // due today, unassigned
    task({ status: "COMPLETED", completedAt: "2026-11-10T09:00:00Z", dueDate: "2026-11-01T00:00:00Z", assigneeIds: ["u2"], projectId: "p1" }),
    task({ status: "COMPLETED", completedAt: "2026-11-03T09:00:00Z", archived: true, createdAt: "2026-10-20T06:00:00Z" }),
  ];
  const r = computeInsights(tasks, {
    now,
    tzOffsetMinutes: IST,
    members: [{ id: "u1", name: "Asha" }, { id: "u2", name: "Bilal" }],
    projects: [{ id: "p1", name: "Launch" }, { id: "p2", name: "Ops" }, { id: "p3", name: "Empty" }],
  });

  it("counts totals without archived tasks", () => {
    expect(r.totals).toMatchObject({ total: 4, open: 3, inProgress: 1, completed: 1, overdue: 1, dueThisWeek: 2, unassignedOpen: 1, completionRate: 25 });
  });
  it("does not mark completed or due-today tasks overdue", () => {
    expect(r.byProject.find((p) => p.projectId === "p2")?.overdue).toBe(0);
  });
  it("groups by status", () => {
    expect(r.byStatus.map((s) => s.count)).toEqual([2, 1, 1]);
  });
  it("groups by assignee with names, sorted by open", () => {
    expect(r.byAssignee).toEqual([
      { userId: "u1", name: "Asha", open: 2, overdue: 1, completed: 0 },
      { userId: "u2", name: "Bilal", open: 1, overdue: 0, completed: 1 },
    ]);
  });
  it("lists projects with work, hides empty ones", () => {
    expect(r.byProject.map((p) => p.name)).toEqual(["Launch", "Ops"]);
    expect(r.byProject[0]).toMatchObject({ open: 2, overdue: 1, completed: 1 });
  });
  it("builds weekly throughput including archived completions", () => {
    expect(r.completedPerWeek).toHaveLength(8);
    const last = r.completedPerWeek[7];
    const prev = r.completedPerWeek[6];
    expect(last.weekStart).toBe("2026-11-09");
    expect(last.completed).toBe(1);
    expect(prev).toMatchObject({ weekStart: "2026-11-02", completed: 1, created: 4 });
    expect(r.totals.completedThisWeek).toBe(1);
  });
  it("handles empty input", () => {
    const e = computeInsights([], { now });
    expect(e.totals.completionRate).toBe(0);
    expect(e.byAssignee).toEqual([]);
  });
});
