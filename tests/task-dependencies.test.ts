import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/workspace", () => ({ canAccessTask: vi.fn(), canEditTask: vi.fn() }));

import { countReadyTasks, isReadyToStart, openBlockers, sameScope, wouldCreateCycle } from "@/lib/task-dependencies";

describe("wouldCreateCycle", () => {
  it("refuses a task blocking itself", () => {
    expect(wouldCreateCycle([], "a", "a")).toBe(true);
  });

  it("allows a fresh link", () => {
    expect(wouldCreateCycle([], "a", "b")).toBe(false);
  });

  it("refuses a direct loop (b already waits on a)", () => {
    expect(wouldCreateCycle([{ taskId: "b", dependsOnId: "a" }], "a", "b")).toBe(true);
  });

  it("refuses an indirect loop a <- c <- b", () => {
    const edges = [
      { taskId: "b", dependsOnId: "c" },
      { taskId: "c", dependsOnId: "a" },
    ];
    expect(wouldCreateCycle(edges, "a", "b")).toBe(true);
  });

  it("allows diamonds that are not loops", () => {
    const edges = [
      { taskId: "d", dependsOnId: "b" },
      { taskId: "d", dependsOnId: "c" },
      { taskId: "b", dependsOnId: "a" },
      { taskId: "c", dependsOnId: "a" },
    ];
    expect(wouldCreateCycle(edges, "c", "b")).toBe(false);
    expect(wouldCreateCycle(edges, "a", "d")).toBe(true);
  });

  it("terminates on existing loops in bad data", () => {
    const edges = [
      { taskId: "x", dependsOnId: "y" },
      { taskId: "y", dependsOnId: "x" },
    ];
    expect(wouldCreateCycle(edges, "a", "x")).toBe(false);
  });
});

describe("sameScope", () => {
  it("needs the same workspace for workspace tasks", () => {
    expect(sameScope({ workspaceId: "w1", userId: "u1" }, { workspaceId: "w1", userId: "u2" })).toBe(true);
    expect(sameScope({ workspaceId: "w1", userId: "u1" }, { workspaceId: "w2", userId: "u1" })).toBe(false);
    expect(sameScope({ workspaceId: "w1", userId: "u1" }, { workspaceId: null, userId: "u1" })).toBe(false);
  });

  it("needs the same owner for personal tasks", () => {
    expect(sameScope({ workspaceId: null, userId: "u1" }, { workspaceId: null, userId: "u1" })).toBe(true);
    expect(sameScope({ workspaceId: null, userId: "u1" }, { workspaceId: null, userId: "u2" })).toBe(false);
  });
});

describe("openBlockers", () => {
  it("keeps only blockers that are not done", () => {
    const list = [
      { id: "1", status: "COMPLETED" },
      { id: "2", status: "IN_PROGRESS" },
      { id: "3", status: "PENDING" },
    ];
    expect(openBlockers(list).map((b) => b.id)).toEqual(["2", "3"]);
  });
});

describe("isReadyToStart / countReadyTasks", () => {
  it("treats incomplete tasks with zero open blockers as ready", () => {
    expect(isReadyToStart({ status: "PENDING", openBlockerCount: 0 })).toBe(true);
    expect(isReadyToStart({ status: "IN_PROGRESS" })).toBe(true);
    expect(isReadyToStart({ status: "PENDING", openBlockerCount: 2 })).toBe(false);
    expect(isReadyToStart({ status: "COMPLETED", openBlockerCount: 0 })).toBe(false);
  });

  it("counts only ready tasks in a list", () => {
    const tasks = [
      { id: "a", status: "PENDING", openBlockerCount: 0 },
      { id: "b", status: "PENDING", openBlockerCount: 1 },
      { id: "c", status: "COMPLETED", openBlockerCount: 0 },
      { id: "d", status: "IN_PROGRESS", openBlockerCount: 0 },
    ];
    expect(countReadyTasks(tasks)).toBe(2);
  });
});
