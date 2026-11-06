import { prisma } from "@/lib/prisma";
import { canAccessTask, canEditTask } from "@/lib/workspace";
import { visibleTaskWhere } from "@/lib/visible-records";
import { createNotification } from "@/lib/notifications";

export class DependencyError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "DependencyError";
  }
}

export const MAX_DEPENDENCIES_PER_TASK = 50;

type Edge = { taskId: string; dependsOnId: string };

/**
 * Would adding "taskId is blocked by dependsOnId" create a loop?
 * True when taskId is already (directly or indirectly) a blocker of dependsOnId.
 */
export function wouldCreateCycle(edges: Edge[], taskId: string, dependsOnId: string) {
  if (taskId === dependsOnId) return true;
  const blockersOf = new Map<string, string[]>();
  for (const e of edges) {
    const list = blockersOf.get(e.taskId) ?? [];
    list.push(e.dependsOnId);
    blockersOf.set(e.taskId, list);
  }
  const seen = new Set<string>();
  const stack = [dependsOnId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === taskId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(blockersOf.get(cur) ?? []));
  }
  return false;
}

/** Both tasks must live in the same place: same workspace, or both personal tasks of one owner. */
export function sameScope(
  a: { workspaceId: string | null; userId: string },
  b: { workspaceId: string | null; userId: string }
) {
  if (a.workspaceId || b.workspaceId) return a.workspaceId === b.workspaceId;
  return a.userId === b.userId;
}

/** Open (not completed) blockers out of a list. */
export function openBlockers<T extends { status: string }>(blockers: T[]) {
  return blockers.filter((b) => b.status !== "COMPLETED");
}

const taskSummary = { id: true, title: true, status: true, dueDate: true } as const;

export async function listDependencies(taskId: string) {
  const [blockedBy, blocking] = await Promise.all([
    prisma.taskDependency.findMany({
      where: { taskId, dependsOn: visibleTaskWhere() },
      include: { dependsOn: { select: taskSummary } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.taskDependency.findMany({
      where: { dependsOnId: taskId, task: visibleTaskWhere() },
      include: { task: { select: taskSummary } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const blockers = blockedBy.map((d) => d.dependsOn);
  return {
    blockedBy: blockers,
    blocking: blocking.map((d) => d.task),
    openBlockerCount: openBlockers(blockers).length,
  };
}

export async function getOpenBlockers(taskId: string) {
  const { blockedBy } = await listDependencies(taskId);
  return openBlockers(blockedBy);
}

/** Collect the dependency edges reachable around a scope, to check for cycles. */
async function scopeEdges(task: { workspaceId: string | null; userId: string }) {
  return prisma.taskDependency.findMany({
    where: task.workspaceId
      ? { task: { workspaceId: task.workspaceId } }
      : { task: { workspaceId: null, userId: task.userId } },
    select: { taskId: true, dependsOnId: true },
  });
}

export async function addDependency(userId: string, taskId: string, dependsOnId: string) {
  if (taskId === dependsOnId) throw new DependencyError("A task can't be blocked by itself");
  const task = await canAccessTask(userId, taskId);
  if (!task) throw new DependencyError("Task not found", 404);
  if (!(await canEditTask(userId, taskId))) {
    throw new DependencyError("You do not have permission to edit this task", 403);
  }
  const blocker = await canAccessTask(userId, dependsOnId);
  if (!blocker) throw new DependencyError("Blocking task not found", 404);
  if (!sameScope(task, blocker)) {
    throw new DependencyError("Both tasks must be in the same workspace");
  }
  const count = await prisma.taskDependency.count({ where: { taskId } });
  if (count >= MAX_DEPENDENCIES_PER_TASK) {
    throw new DependencyError(`A task can have at most ${MAX_DEPENDENCIES_PER_TASK} blockers`);
  }
  const edges = await scopeEdges(task);
  if (edges.some((e) => e.taskId === taskId && e.dependsOnId === dependsOnId)) {
    return listDependencies(taskId);
  }
  if (wouldCreateCycle(edges, taskId, dependsOnId)) {
    throw new DependencyError("That would create a loop: this task already blocks the other one", 409);
  }
  await prisma.taskDependency.create({ data: { taskId, dependsOnId, createdById: userId } });
  return listDependencies(taskId);
}

export async function removeDependency(userId: string, taskId: string, dependsOnId: string) {
  const task = await canAccessTask(userId, taskId);
  if (!task) throw new DependencyError("Task not found", 404);
  if (!(await canEditTask(userId, taskId))) {
    throw new DependencyError("You do not have permission to edit this task", 403);
  }
  await prisma.taskDependency.deleteMany({ where: { taskId, dependsOnId } });
  return listDependencies(taskId);
}


/** Incomplete assigned (or any) task with no open blockers. */
export function isReadyToStart(task: { status: string; openBlockerCount?: number }) {
  return task.status !== "COMPLETED" && (task.openBlockerCount ?? 0) === 0;
}

export function countReadyTasks<T extends { status: string; openBlockerCount?: number }>(tasks: T[]) {
  return tasks.filter(isReadyToStart).length;
}

/**
 * Batch-attach openBlockerCount for a page of tasks (one query, not N+1).
 * Soft-deleted blockers (dependsOn.deletedAt set) do not count as open.
 */
export async function attachOpenBlockerCounts<T extends { id: string }>(
  tasks: T[]
): Promise<(T & { openBlockerCount: number })[]> {
  if (tasks.length === 0) return [];
  const ids = tasks.map((t) => t.id);
  const rows = await prisma.taskDependency.findMany({
    where: {
      taskId: { in: ids },
      dependsOn: {
        deletedAt: null,
        status: { not: "COMPLETED" },
      },
    },
    select: { taskId: true },
  });
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.taskId, (counts.get(row.taskId) ?? 0) + 1);
  }
  return tasks.map((t) => ({ ...t, openBlockerCount: counts.get(t.id) ?? 0 }));
}

/**
 * After a task is completed, tell the people on each task it was blocking
 * that is now fully unblocked (owner + assignees, minus the actor).
 */
export async function notifyUnblocked(completedTaskId: string, actorId: string) {
  const dependents = await prisma.taskDependency.findMany({
    where: { dependsOnId: completedTaskId, task: visibleTaskWhere({ status: { not: "COMPLETED" } }) },
    select: {
      task: {
        select: {
          id: true,
          title: true,
          userId: true,
          assignees: { select: { userId: true } },
          blockedBy: { select: { dependsOn: { select: { status: true, deletedAt: true } } } },
        },
      },
    },
  });
  const notified: string[] = [];
  for (const { task } of dependents) {
    const stillOpen = task.blockedBy.some(
      (b) => b.dependsOn.status !== "COMPLETED" && b.dependsOn.deletedAt === null
    );
    if (stillOpen) continue;
    const recipients = new Set([task.userId, ...task.assignees.map((a) => a.userId)]);
    recipients.delete(actorId);
    for (const uid of recipients) {
      await createNotification({
        userId: uid,
        title: "Task unblocked",
        body: `"${task.title}" is ready to start: everything blocking it is done`,
        type: "task_unblocked",
      });
      notified.push(uid);
    }
  }
  return notified;
}
