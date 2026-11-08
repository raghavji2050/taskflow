import { prisma } from "@/lib/prisma";
import { canEditTask } from "@/lib/workspace";
import { visibleTaskWhere } from "@/lib/visible-records";
import { logTaskActivity } from "@/lib/activity";

/** Hard cap so one date change can never rewrite a whole workspace. */
export const MAX_SHIFTED_TASKS = 100;

export type ShiftNode = { id: string; dueDate: Date | null; status: string };
export type PlannedShift = { id: string; from: Date; to: Date };

/** blocker id -> ids of tasks waiting on it. */
export function dependentsMap(edges: { taskId: string; dependsOnId: string }[]) {
  const map = new Map<string, string[]>();
  for (const e of edges) {
    const list = map.get(e.dependsOnId) ?? [];
    list.push(e.taskId);
    map.set(e.dependsOnId, list);
  }
  return map;
}

/** Every task reachable downstream of rootId (loop-safe, root excluded). */
export function downstreamIds(rootId: string, dependentsOf: Map<string, string[]>, max = MAX_SHIFTED_TASKS * 2) {
  const seen = new Set<string>([rootId]);
  const out: string[] = [];
  const queue = [rootId];
  while (queue.length && out.length < max) {
    const cur = queue.shift()!;
    for (const next of dependentsOf.get(cur) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      out.push(next);
      queue.push(next);
    }
  }
  return out;
}

/**
 * When a blocker's due date moves later by deltaMs, push every open, dated task
 * downstream of it by the same amount (keeps the gap between them).
 * Completed or undated tasks don't move, and nothing behind them moves either.
 * Each task shifts at most once, even in diamonds; loops are ignored.
 */
export function planDependentShift(
  rootId: string,
  deltaMs: number,
  dependentsOf: Map<string, string[]>,
  nodes: Map<string, ShiftNode>,
  max = MAX_SHIFTED_TASKS
): PlannedShift[] {
  if (!(deltaMs > 0)) return [];
  const seen = new Set<string>([rootId]);
  const plan: PlannedShift[] = [];
  const queue = [rootId];
  while (queue.length && plan.length < max) {
    const cur = queue.shift()!;
    for (const next of dependentsOf.get(cur) ?? []) {
      if (seen.has(next) || plan.length >= max) continue;
      seen.add(next);
      const node = nodes.get(next);
      if (!node || node.status === "COMPLETED" || !node.dueDate) continue;
      plan.push({ id: next, from: node.dueDate, to: new Date(node.dueDate.getTime() + deltaMs) });
      queue.push(next);
    }
  }
  return plan;
}

export type ShiftedTask = { id: string; title: string; from: string; to: string };

/**
 * Server side of auto date-shift. Call after a task's due date was saved.
 * Only shifts when the date moved later; returns what moved so the UI can offer Undo.
 */
export async function shiftDependentsAfterDueChange(input: {
  userId: string;
  taskId: string;
  scope: { workspaceId: string | null; userId: string };
  oldDue: Date | null;
  newDue: Date | null;
}): Promise<ShiftedTask[]> {
  const { userId, taskId, scope, oldDue, newDue } = input;
  if (!oldDue || !newDue) return [];
  const delta = newDue.getTime() - oldDue.getTime();
  if (delta <= 0) return [];

  const edges = await prisma.taskDependency.findMany({
    where: scope.workspaceId
      ? { task: { workspaceId: scope.workspaceId } }
      : { task: { workspaceId: null, userId: scope.userId } },
    select: { taskId: true, dependsOnId: true },
  });
  const dependentsOf = dependentsMap(edges);
  const ids = downstreamIds(taskId, dependentsOf);
  if (ids.length === 0) return [];

  const rows = await prisma.task.findMany({
    where: visibleTaskWhere({ id: { in: ids }, archived: false }),
    select: { id: true, title: true, dueDate: true, status: true },
  });
  const nodes = new Map(rows.map((r) => [r.id, r]));
  const plan = planDependentShift(taskId, delta, dependentsOf, nodes);

  const shifted: ShiftedTask[] = [];
  for (const step of plan) {
    if (!(await canEditTask(userId, step.id))) continue;
    await prisma.task.update({ where: { id: step.id }, data: { dueDate: step.to } });
    await logTaskActivity(step.id, "updated", "Due date auto-shifted because a blocking task moved later");
    shifted.push({ id: step.id, title: nodes.get(step.id)!.title, from: step.from.toISOString(), to: step.to.toISOString() });
  }
  return shifted;
}

/** Attach the ids of each task's (non-deleted) blockers, for drawing timeline arrows. */
export async function attachBlockedByIds<T extends { id: string }>(tasks: T[]): Promise<(T & { blockedByIds: string[] })[]> {
  if (tasks.length === 0) return [];
  const rows = await prisma.taskDependency.findMany({
    where: { taskId: { in: tasks.map((t) => t.id) }, dependsOn: { deletedAt: null } },
    select: { taskId: true, dependsOnId: true },
  });
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.taskId, [...(map.get(r.taskId) ?? []), r.dependsOnId]);
  return tasks.map((t) => ({ ...t, blockedByIds: map.get(t.id) ?? [] }));
}
