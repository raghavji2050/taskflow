import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ task: { findMany: vi.fn(), count: vi.fn() }, timeEntry: { findMany: vi.fn() } }));
const ws = vi.hoisted(() => ({ getUserWorkspaceIds: vi.fn(), getWorkspaceMembership: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/workspace", () => ws);
vi.mock("@/lib/projects", () => ({ requireProjectAccess: vi.fn() }));
vi.mock("@/lib/time-tracking", () => ({ getActiveTimer: vi.fn().mockResolvedValue(null) }));
import { dayBounds, findBlockers, planMyDay, weeklyReport } from "@/lib/mcp/tools-smart";

const user = { id: "u1", name: "R" };
const now = new Date("2026-11-03T12:00:00Z"); // 17:30 IST
const t = (o: Record<string, unknown>) => ({ id: "x", title: "T", status: "PENDING", priority: "MEDIUM", dueDate: null, updatedAt: now, workspaceId: null, projectId: null, project: null, assignees: [], subtasks: [], ...o });
beforeEach(() => { vi.clearAllMocks(); ws.getUserWorkspaceIds.mockResolvedValue([]); });

describe("smart tools", () => {
  it("dayBounds uses IST", () => {
    expect(dayBounds(now).start.toISOString()).toBe("2026-11-02T18:30:00.000Z");
  });
  it("plan_my_day orders overdue, today, then priority", async () => {
    db.task.findMany.mockResolvedValue([
      t({ id: "h", priority: "HIGH" }),
      t({ id: "d", dueDate: new Date("2026-11-03T10:00:00Z") }),
      t({ id: "o", dueDate: new Date("2026-11-01T10:00:00Z") }),
    ]);
    const r = await planMyDay(user, {}, now);
    expect(r.focus.map((f) => f.id)).toEqual(["o", "d", "h"]);
    expect(r.focus[0].reason).toBe("overdue");
  });
  it("find_blockers flags overdue, open subtasks and stale", async () => {
    db.task.findMany.mockResolvedValue([
      t({ id: "a", status: "IN_PROGRESS", subtasks: [{ completed: false }, { completed: true }], assignees: [{ user: { id: "u2", name: "Amit" } }] }),
      t({ id: "b", updatedAt: new Date("2026-10-01T00:00:00Z") }),
      t({ id: "c" }),
    ]);
    const r = await findBlockers(user, {}, now);
    expect(r.count).toBe(2);
    expect(r.byAssignee).toEqual({ Amit: 1, "(unassigned)": 1 });
  });
  it("weekly_report rejects non-members and sums time", async () => {
    ws.getWorkspaceMembership.mockResolvedValue(null);
    await expect(weeklyReport(user, { workspaceId: "w" }, now)).rejects.toThrow(/not found/);
    ws.getWorkspaceMembership.mockResolvedValue({ role: "MEMBER" });
    db.task.findMany.mockResolvedValue([t({ status: "COMPLETED", assignees: [{ user: { id: "u1", name: "R" } }] })]);
    db.task.count.mockResolvedValueOnce(4).mockResolvedValueOnce(1);
    db.timeEntry.findMany.mockResolvedValue([{ duration: 5400, user: { name: "R" } }]);
    const r = await weeklyReport(user, { workspaceId: "w" }, now);
    expect(r.totals).toEqual({ completed: 1, created: 4, overdueNow: 1, hoursLogged: 1.5 });
    expect(r.members.R).toEqual({ completed: 1, minutesLogged: 90 });
  });
});
