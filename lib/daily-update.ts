import { startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import type { DailyUpdateGroup } from "@/lib/daily-update-format";

export type { DailyUpdateGroup, DailyUpdateTask } from "@/lib/daily-update-format";
export { formatDailyUpdateText } from "@/lib/daily-update-format";

/** Tasks worked on today, grouped by category (personal workspace). */
export async function getDailyUpdatesByCategory(userId: string): Promise<DailyUpdateGroup[]> {
  const startOfToday = startOfDay(new Date());

  const tasks = await prisma.task.findMany({
    where: {
      userId,
      workspaceId: null,
      categoryId: { not: null },
      OR: [
        { completedAt: { gte: startOfToday } },
        {
          updatedAt: { gte: startOfToday },
          status: { in: ["IN_PROGRESS", "PENDING"] },
        },
      ],
    },
    select: {
      id: true,
      title: true,
      position: true,
      createdAt: true,
      categoryId: true,
      category: { select: { id: true, name: true } },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  type TaskEntry = { id: string; title: string; position: number; createdAt: Date };

  const byCategory = new Map<
    string,
    { categoryId: string; categoryName: string; tasks: TaskEntry[] }
  >();

  for (const task of tasks) {
    if (!task.category) continue;
    const key = task.category.id;
    const entry: TaskEntry = {
      id: task.id,
      title: task.title,
      position: task.position,
      createdAt: task.createdAt,
    };
    const existing = byCategory.get(key);
    if (existing) {
      if (!existing.tasks.some((t) => t.id === task.id)) {
        existing.tasks.push(entry);
      }
    } else {
      byCategory.set(key, {
        categoryId: task.category.id,
        categoryName: task.category.name,
        tasks: [entry],
      });
    }
  }

  const sortTasks = (a: TaskEntry, b: TaskEntry) =>
    a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime();

  const groups = Array.from(byCategory.values()).map((group) => {
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
    .map(({ categoryId, categoryName, tasks }) => ({ categoryId, categoryName, tasks }));
}
