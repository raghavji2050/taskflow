import { startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { visibleTaskWhere } from "@/lib/visible-records";
import type { DailyUpdateGroup } from "@/lib/daily-update-format";

export type { DailyUpdateGroup, DailyUpdateTask } from "@/lib/daily-update-format";
export { formatDailyUpdateText } from "@/lib/daily-update-format";

export const UNCATEGORIZED_KEY = "uncategorized";

export type DailyUpdateTaskRow = {
  id: string;
  title: string;
  position: number;
  createdAt: Date;
  categoryId: string | null;
  workspaceId: string | null;
  category: { id: string; name: string } | null;
  workspace: { id: string; name: string } | null;
};

export function getDailyUpdateGroupKey(task: {
  category: { id: string } | null;
  workspaceId: string | null;
}): string {
  if (task.category) return task.category.id;
  if (task.workspaceId) return `ws:${task.workspaceId}`;
  return UNCATEGORIZED_KEY;
}

export function getDailyUpdateGroupName(task: {
  category: { name: string } | null;
  workspace: { name: string } | null;
  workspaceId: string | null;
}): string {
  if (task.category) {
    return task.workspace
      ? `${task.workspace.name} — ${task.category.name}`
      : task.category.name;
  }
  if (task.workspace) return task.workspace.name;
  return "Uncategorized";
}

export function groupDailyUpdateTasks(tasks: DailyUpdateTaskRow[]): DailyUpdateGroup[] {
  type TaskEntry = { id: string; title: string; position: number; createdAt: Date };

  const byGroup = new Map<
    string,
    { categoryId: string | null; categoryName: string; tasks: TaskEntry[] }
  >();

  for (const task of tasks) {
    const key = getDailyUpdateGroupKey(task);
    const entry: TaskEntry = {
      id: task.id,
      title: task.title,
      position: task.position,
      createdAt: task.createdAt,
    };
    const existing = byGroup.get(key);
    if (existing) {
      if (!existing.tasks.some((t) => t.id === task.id)) {
        existing.tasks.push(entry);
      }
    } else {
      byGroup.set(key, {
        categoryId: task.category?.id ?? null,
        categoryName: getDailyUpdateGroupName(task),
        tasks: [entry],
      });
    }
  }

  const sortTasks = (a: TaskEntry, b: TaskEntry) =>
    a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime();

  const groups = Array.from(byGroup.values()).map((group) => {
    const sortedTasks = [...group.tasks].sort(sortTasks);
    const earliest = sortedTasks[0];
    return {
      categoryId: group.categoryId,
      categoryName: group.categoryName,
      tasks: sortedTasks.map(({ id, title }) => ({ id, title })),
      sortKey: earliest ? earliest.position : 0,
      sortAt: earliest?.createdAt.getTime() ?? 0,
    };
  });

  return groups
    .sort((a, b) => a.sortKey - b.sortKey || a.sortAt - b.sortAt)
    .map(({ categoryId, categoryName, tasks: groupedTasks }) => ({
      categoryId,
      categoryName,
      tasks: groupedTasks,
    }));
}

/** Tasks worked on today, grouped by category (personal + assigned workspace tasks). */
export async function getDailyUpdatesByCategory(userId: string): Promise<DailyUpdateGroup[]> {
  const startOfToday = startOfDay(new Date());

  const tasks = await prisma.task.findMany({
    where: visibleTaskWhere({
      archived: false,
      AND: [
        {
          OR: [
            { userId, workspaceId: null },
            { assignees: { some: { userId } } },
          ],
        },
        {
          OR: [
            { completedAt: { gte: startOfToday } },
            {
              updatedAt: { gte: startOfToday },
              status: { in: ["IN_PROGRESS", "PENDING"] },
            },
            {
              timeEntries: {
                some: {
                  userId,
                  OR: [
                    { startTime: { gte: startOfToday } },
                    { isRunning: true },
                  ],
                },
              },
            },
          ],
        },
      ],
    }),
    select: {
      id: true,
      title: true,
      position: true,
      createdAt: true,
      categoryId: true,
      workspaceId: true,
      category: { select: { id: true, name: true } },
      workspace: { select: { id: true, name: true } },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  return groupDailyUpdateTasks(tasks);
}
