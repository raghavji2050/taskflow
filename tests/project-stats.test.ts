import { describe, expect, it } from "vitest";
import { dayKey, projectStats } from "@/lib/project-stats";

describe("projectStats", () => {
  const now = new Date(2026, 10, 5, 10, 0, 0);
  const sections = [{ id: "a", name: "To do" }, { id: "b", name: "Done" }];
  const u = (id: string) => ({ user: { id, name: id.toUpperCase() } });
  const tasks = [
    { id: "1", status: "COMPLETED", dueDate: "2026-11-01", sectionId: "b" },
    { id: "2", status: "PENDING", dueDate: "2026-11-01", sectionId: "a", assignees: [u("r")] },
    { id: "3", status: "IN_PROGRESS", dueDate: "2026-11-05", sectionId: "a", assignees: [u("r"), u("s")] },
    { id: "4", status: "PENDING", dueDate: null, sectionId: "a" },
  ];

  it("counts progress, overdue, today and sections", () => {
    const s = projectStats(tasks, sections, now);
    expect(s).toMatchObject({ total: 4, done: 1, inProgress: 1, pending: 2, percent: 25, overdue: 1, dueToday: 1, noDate: 1, unassigned: 1 });
    expect(s.bySection).toEqual([
      { id: "a", name: "To do", total: 3, done: 0, open: 3 },
      { id: "b", name: "Done", total: 1, done: 1, open: 0 },
    ]);
    expect(s.workload).toEqual([{ name: "R", open: 2 }, { name: "S", open: 1 }]);
  });

  it("handles an empty project", () => {
    expect(projectStats([], sections, now).percent).toBe(0);
  });

  it("dayKey keeps date-only strings", () => {
    expect(dayKey("2026-11-05")).toBe("2026-11-05");
  });
});
