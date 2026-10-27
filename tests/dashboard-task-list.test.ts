import { describe, expect, it } from "vitest";
import type { Task } from "@/components/TaskCard";
import type { DashboardStatsData } from "@/components/DashboardStats";
import {
  applyOptimisticTaskChange,
  confirmOptimisticSave,
  createOptimisticTaskId,
  optimisticTaskFromInput,
  type OptimisticListFilters,
  type TaskBoardState,
} from "@/lib/dashboard-task-list";

const filters: OptimisticListFilters = {
  search: "",
  status: "ALL",
  priority: "ALL",
  archived: "false",
  categoryId: "",
};

function task(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    description: null,
    priority: "MEDIUM",
    status: "PENDING",
    dueDate: null,
    archived: false,
    createdAt: "2026-10-27T00:00:00.000Z",
    updatedAt: "2026-10-27T00:00:00.000Z",
    ...partial,
  };
}

const stats: DashboardStatsData = {
  total: 1,
  completed: 0,
  pending: 1,
  inProgress: 0,
  highPriority: 0,
  completionPercentage: 0,
};

function board(tasks: Task[], recent: Task[] = tasks): TaskBoardState {
  return { tasks, recentTasks: recent, stats };
}

describe("dashboard optimistic task list", () => {
  it("inserts a created task and bumps active stats without a refetch", () => {
    const existing = task({ id: "t1", title: "Existing" });
    const created = task({ id: "optimistic-1", title: "Ship", priority: "HIGH" });
    const next = applyOptimisticTaskChange(board([existing]), { type: "create", task: created }, filters);
    expect(next.tasks.map((item) => item.id)).toEqual(["optimistic-1", "t1"]);
    expect(next.recentTasks[0]?.id).toBe("optimistic-1");
    expect(next.stats).toMatchObject({ total: 2, pending: 2, highPriority: 1, completionPercentage: 0 });
  });

  it("hides a created task that does not match the status filter but still counts it", () => {
    const created = task({ id: "optimistic-1", title: "Done", status: "COMPLETED" });
    const next = applyOptimisticTaskChange(
      {
        tasks: [],
        recentTasks: [],
        stats: { total: 0, completed: 0, pending: 0, highPriority: 0, completionPercentage: 0 },
      },
      { type: "create", task: created },
      { ...filters, status: "PENDING" }
    );
    expect(next.tasks).toEqual([]);
    expect(next.recentTasks.map((item) => item.id)).toEqual(["optimistic-1"]);
    expect(next.stats).toMatchObject({ total: 1, completed: 1, pending: 0, completionPercentage: 100 });
  });

  it("updates a task in place and moves it off a filtered list", () => {
    const current = task({ id: "t1", title: "Write", status: "PENDING" });
    const updated = { ...current, status: "IN_PROGRESS" as const };
    const next = applyOptimisticTaskChange(
      board([current], [current]),
      { type: "update", previous: current, task: updated },
      { ...filters, status: "PENDING" }
    );
    expect(next.tasks).toEqual([]);
    expect(next.recentTasks[0]?.status).toBe("IN_PROGRESS");
    expect(next.stats).toMatchObject({ total: 1, pending: 0, inProgress: 1 });
  });

  it("removes a deleted task and rolls the stats back", () => {
    const current = task({ id: "t1", title: "Write", priority: "HIGH" });
    const start = applyOptimisticTaskChange(
      { tasks: [], recentTasks: [], stats: { ...stats, total: 0, pending: 0 } },
      { type: "create", task: current },
      filters
    );
    const next = applyOptimisticTaskChange(start, { type: "delete", task: current }, filters);
    expect(next.tasks).toEqual([]);
    expect(next.recentTasks).toEqual([]);
    expect(next.stats).toMatchObject({ total: 0, pending: 0, highPriority: 0, completionPercentage: 0 });
  });

  it("drops an archived task from the active list", () => {
    const current = task({ id: "t1", title: "Write" });
    const archived = { ...current, archived: true };
    const next = applyOptimisticTaskChange(
      board([current]),
      { type: "update", previous: current, task: archived },
      filters
    );
    expect(next.tasks).toEqual([]);
    expect(next.recentTasks).toEqual([]);
    expect(next.stats.total).toBe(0);
  });

  it("replaces the provisional id with the saved task without duplicating it", () => {
    const provisional = task({ id: "optimistic-1", title: "Ship" });
    const saved = task({ id: "real-1", title: "Ship", createdAt: "2026-10-27T01:00:00.000Z" });
    const state = applyOptimisticTaskChange(board([]), { type: "create", task: provisional }, filters);
    const next = confirmOptimisticSave(state, provisional.id, saved, filters);
    expect(next.tasks.map((item) => item.id)).toEqual(["real-1"]);
    expect(next.recentTasks.map((item) => item.id)).toEqual(["real-1"]);
    expect(next.stats.total).toBe(state.stats.total);
  });

  it("builds a provisional task from the form payload", () => {
    const existing = task({
      id: "t1",
      title: "Old",
      categoryId: "cat-1",
      category: { id: "cat-1", name: "Work", color: "#fff" },
    });
    const next = optimisticTaskFromInput(
      {
        title: "New title",
        description: "notes",
        priority: "LOW",
        status: "PENDING",
        dueDate: null,
        categoryId: "cat-1",
        assigneeIds: [],
        workspaceId: null,
      },
      existing.id,
      existing
    );
    expect(next.title).toBe("New title");
    expect(next.category?.name).toBe("Work");
    expect(createOptimisticTaskId().startsWith("optimistic-")).toBe(true);
  });
});
