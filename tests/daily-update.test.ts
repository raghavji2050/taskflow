import { describe, expect, it } from "vitest";
import {
  getDailyUpdateGroupKey,
  getDailyUpdateGroupName,
  groupDailyUpdateTasks,
  UNCATEGORIZED_KEY,
  type DailyUpdateTaskRow,
} from "@/lib/daily-update";

const baseDate = new Date("2026-06-17T10:00:00");

function task(overrides: Partial<DailyUpdateTaskRow> & Pick<DailyUpdateTaskRow, "id" | "title">): DailyUpdateTaskRow {
  return {
    position: 0,
    createdAt: baseDate,
    categoryId: null,
    workspaceId: null,
    category: null,
    workspace: null,
    ...overrides,
  };
}

describe("daily-update grouping helpers", () => {
  it("uses category id as key for categorized personal tasks", () => {
    const row = task({
      id: "t1",
      title: "Design",
      category: { id: "cat-1", name: "Design" },
      categoryId: "cat-1",
    });
    expect(getDailyUpdateGroupKey(row)).toBe("cat-1");
    expect(getDailyUpdateGroupName(row)).toBe("Design");
  });

  it("prefixes workspace name for categorized workspace tasks", () => {
    const row = task({
      id: "t1",
      title: "API work",
      workspaceId: "ws-1",
      workspace: { id: "ws-1", name: "Acme" },
      category: { id: "cat-1", name: "Backend" },
      categoryId: "cat-1",
    });
    expect(getDailyUpdateGroupKey(row)).toBe("cat-1");
    expect(getDailyUpdateGroupName(row)).toBe("Acme — Backend");
  });

  it("groups uncategorized workspace tasks under workspace name", () => {
    const row = task({
      id: "t1",
      title: "Quick fix",
      workspaceId: "ws-1",
      workspace: { id: "ws-1", name: "Acme" },
    });
    expect(getDailyUpdateGroupKey(row)).toBe("ws:ws-1");
    expect(getDailyUpdateGroupName(row)).toBe("Acme");
  });

  it("groups uncategorized personal tasks under Uncategorized", () => {
    const row = task({ id: "t1", title: "Inbox" });
    expect(getDailyUpdateGroupKey(row)).toBe(UNCATEGORIZED_KEY);
    expect(getDailyUpdateGroupName(row)).toBe("Uncategorized");
  });
});

describe("groupDailyUpdateTasks", () => {
  it("includes uncategorized personal tasks", () => {
    const groups = groupDailyUpdateTasks([
      task({ id: "t1", title: "Logged time today", position: 1 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].categoryName).toBe("Uncategorized");
    expect(groups[0].tasks).toEqual([{ id: "t1", title: "Logged time today" }]);
  });

  it("groups assigned workspace task with category", () => {
    const groups = groupDailyUpdateTasks([
      task({
        id: "t1",
        title: "Timer task",
        workspaceId: "ws-1",
        workspace: { id: "ws-1", name: "Team" },
        category: { id: "cat-1", name: "Features" },
        categoryId: "cat-1",
      }),
    ]);
    expect(groups[0].categoryName).toBe("Team — Features");
    expect(groups[0].tasks[0].title).toBe("Timer task");
  });

  it("deduplicates the same task id within a group", () => {
    const row = task({
      id: "t1",
      title: "Once",
      category: { id: "cat-1", name: "Work" },
      categoryId: "cat-1",
    });
    const groups = groupDailyUpdateTasks([row, row]);
    expect(groups[0].tasks).toHaveLength(1);
  });

  it("sorts tasks by position then createdAt within a group", () => {
    const groups = groupDailyUpdateTasks([
      task({
        id: "t2",
        title: "Second",
        position: 2,
        createdAt: new Date("2026-06-17T12:00:00"),
        category: { id: "cat-1", name: "Work" },
        categoryId: "cat-1",
      }),
      task({
        id: "t1",
        title: "First",
        position: 1,
        createdAt: new Date("2026-06-17T11:00:00"),
        category: { id: "cat-1", name: "Work" },
        categoryId: "cat-1",
      }),
    ]);
    expect(groups[0].tasks.map((t) => t.title)).toEqual(["First", "Second"]);
  });

  it("sorts groups by earliest task position", () => {
    const groups = groupDailyUpdateTasks([
      task({
        id: "t-b",
        title: "B task",
        position: 5,
        category: { id: "cat-b", name: "Beta" },
        categoryId: "cat-b",
      }),
      task({
        id: "t-a",
        title: "A task",
        position: 1,
        category: { id: "cat-a", name: "Alpha" },
        categoryId: "cat-a",
      }),
    ]);
    expect(groups.map((g) => g.categoryName)).toEqual(["Alpha", "Beta"]);
  });
});
