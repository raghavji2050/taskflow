import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  task: { findMany: vi.fn(), count: vi.fn() },
  user: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  notification: { createMany: vi.fn() },
  workspace: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const sendEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email", async () => {
  const actual = await vi.importActual<typeof import("@/lib/email")>("@/lib/email");
  return { ...actual, sendEmail };
});

import {
  getNudgePrefs,
  isPaidWorkspace,
  isStale,
  isWeeklySummaryDay,
  overdueCrossingWindow,
  pickTopTasks,
  runActivePm,
  sendOverdueAlerts,
  sendStaleNudges,
  sendWeeklySummaries,
  staleCrossingWindow,
  updateNudgePrefs,
} from "@/lib/active-pm";

const DAY = 24 * 60 * 60 * 1000;
// Monday 23 Nov 2026, 08:00 UTC (cron time)
const monday = new Date("2026-11-23T08:00:00Z");
const tuesday = new Date("2026-11-24T08:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  db.notification.createMany.mockResolvedValue({ count: 0 });
  sendEmail.mockResolvedValue({ success: true, dev: true });
});

describe("pickTopTasks", () => {
  it("puts overdue first, then due soon, then priority", () => {
    const now = monday;
    const top = pickTopTasks(
      [
        { id: "a", title: "High, no date", priority: "HIGH", dueDate: null },
        { id: "b", title: "Due tomorrow", priority: "LOW", dueDate: new Date(now.getTime() + DAY) },
        { id: "c", title: "Late 2d", priority: "LOW", dueDate: new Date(now.getTime() - 2 * DAY) },
        { id: "d", title: "Late 1d", priority: "HIGH", dueDate: new Date(now.getTime() - DAY) },
        { id: "e", title: "Low, far", priority: "LOW", dueDate: new Date(now.getTime() + 30 * DAY) },
      ],
      now
    );
    expect(top.map((t) => t.title)).toEqual(["Late 2d", "Late 1d", "Due tomorrow"]);
    expect(top.map((t) => t.reason)).toEqual(["overdue", "overdue", "due soon"]);
  });

  it("falls back to priority and dedupes by id", () => {
    const top = pickTopTasks(
      [
        { id: "m", title: "Medium", priority: "MEDIUM" },
        { id: "h", title: "High", priority: "HIGH" },
        { id: "h", title: "High", priority: "HIGH" },
        { id: "l", title: "Low", priority: "LOW" },
      ],
      monday,
      2
    );
    expect(top).toEqual([
      { id: "h", title: "High", reason: "high priority" },
      { id: "m", title: "Medium", reason: "medium priority" },
    ]);
  });
});

describe("time helpers", () => {
  it("isStale uses a 3-day threshold", () => {
    expect(isStale(new Date(monday.getTime() - 3 * DAY), monday)).toBe(true);
    expect(isStale(new Date(monday.getTime() - 2 * DAY), monday)).toBe(false);
    expect(isStale(null, monday)).toBe(false);
  });

  it("windows cover exactly one daily run", () => {
    expect(staleCrossingWindow(monday)).toEqual({
      gte: new Date(monday.getTime() - 4 * DAY),
      lt: new Date(monday.getTime() - 3 * DAY),
    });
    expect(overdueCrossingWindow(monday)).toEqual({ gte: new Date(monday.getTime() - DAY), lt: monday });
  });

  it("weekly summary only on Mondays (UTC)", () => {
    expect(isWeeklySummaryDay(monday)).toBe(true);
    expect(isWeeklySummaryDay(tuesday)).toBe(false);
  });

  it("only live paid plans count as paid", () => {
    expect(isPaidWorkspace("PRO", "active")).toBe(true);
    expect(isPaidWorkspace("PRO", "canceled")).toBe(false);
    expect(isPaidWorkspace("FREE", "active")).toBe(false);
  });
});

describe("sendOverdueAlerts", () => {
  it("notifies owner + assignees who have nudges on", async () => {
    db.task.findMany.mockResolvedValue([
      { id: "t1", title: "Invoice", userId: "owner", assignees: [{ userId: "a1" }, { userId: "owner" }] },
    ]);
    db.user.findMany.mockResolvedValue([{ id: "owner" }]); // a1 opted out
    await expect(sendOverdueAlerts(monday)).resolves.toBe(1);
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ activeNudgesEnabled: true }) })
    );
    expect(db.notification.createMany).toHaveBeenCalledWith({
      data: [{ userId: "owner", type: "task_overdue", title: "Task overdue", body: '"Invoice" is now overdue' }],
    });
  });

  it("does nothing when no task just became overdue", async () => {
    db.task.findMany.mockResolvedValue([]);
    await expect(sendOverdueAlerts(monday)).resolves.toBe(0);
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });
});

describe("sendStaleNudges", () => {
  it("nudges assignees once a task crosses the stale threshold", async () => {
    db.task.findMany.mockResolvedValue([
      { id: "t1", title: "Spec", userId: "owner", assignees: [{ userId: "a1" }, { userId: "a2" }] },
    ]);
    db.user.findMany.mockResolvedValue([{ id: "a1" }, { id: "a2" }]);
    await expect(sendStaleNudges(monday)).resolves.toBe(2);
    const where = db.task.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain("updatedAt");
    const data = db.notification.createMany.mock.calls[0][0].data;
    expect(data.map((d: { userId: string }) => d.userId)).toEqual(["a1", "a2"]);
    expect(data[0].type).toBe("task_stale");
  });
});

describe("sendWeeklySummaries", () => {
  it("skips non-Mondays without touching the DB", async () => {
    await expect(sendWeeklySummaries(tuesday)).resolves.toBe(0);
    expect(db.workspace.findMany).not.toHaveBeenCalled();
  });

  it("emails members of live paid workspaces only", async () => {
    db.workspace.findMany.mockResolvedValue([
      {
        id: "w1",
        name: "Acme",
        plan: "PRO",
        planStatus: "active",
        members: [{ user: { id: "u1", name: "Asha", email: "asha@example.com" } }],
      },
      {
        id: "w2",
        name: "Lapsed",
        plan: "PRO",
        planStatus: "canceled",
        members: [{ user: { id: "u2", name: "Bo", email: "bo@example.com" } }],
      },
    ]);
    db.task.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    await expect(sendWeeklySummaries(monday)).resolves.toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html] = sendEmail.mock.calls[0];
    expect(to).toBe("asha@example.com");
    expect(subject).toContain("Acme");
    expect(html).toContain("<strong>5</strong> done");
    expect(html).toContain("<strong>2</strong> overdue");
    expect(html).toContain("<strong>1</strong> stale");
  });
});

describe("runActivePm", () => {
  it("keeps going when one step fails", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    db.task.findMany.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce([]);
    await expect(runActivePm(tuesday)).resolves.toEqual({
      overdueAlerts: 0,
      staleNudges: 0,
      weeklySummaries: 0,
    });
    expect(db.task.findMany).toHaveBeenCalledTimes(2);
    err.mockRestore();
  });
});

describe("nudge prefs", () => {
  it("defaults on and reads the User column", async () => {
    db.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ activeNudgesEnabled: false });
    await expect(getNudgePrefs("u1")).resolves.toEqual({ activeNudgesEnabled: true });
    await expect(getNudgePrefs("u1")).resolves.toEqual({ activeNudgesEnabled: false });
  });

  it("updates and validates the toggle", async () => {
    db.user.update.mockResolvedValue({ activeNudgesEnabled: false });
    await expect(updateNudgePrefs("u1", { activeNudgesEnabled: false })).resolves.toEqual({
      activeNudgesEnabled: false,
    });
    await expect(updateNudgePrefs("u1", { activeNudgesEnabled: "no" })).rejects.toThrow();
  });
});
