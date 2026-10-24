import { canAccessTask, canEditTask, getWorkspaceMembership } from "@/lib/workspace";
import { canManageWorkspace } from "@/lib/workspace-permissions";

export interface TimeEntryContext {
  id: string;
  userId: string;
  taskId: string;
  task: { workspaceId: string | null };
}

export async function canViewTimeEntry(actorId: string, entry: TimeEntryContext): Promise<boolean> {
  if (entry.userId === actorId) return true;
  const task = await canAccessTask(actorId, entry.taskId);
  return !!task;
}

export async function canEditTimeEntry(actorId: string, entry: TimeEntryContext): Promise<boolean> {
  const flags = await canEditFlagsForTaskEntries(actorId, entry.taskId, [entry.userId]);
  return flags.get(entry.userId) ?? false;
}

/** One permission lookup per task, shared by every entry on that task. */
export async function canEditFlagsForTaskEntries(
  actorId: string,
  taskId: string,
  entryUserIds: Iterable<string>
): Promise<Map<string, boolean>> {
  const ids = [...new Set(entryUserIds)];
  const flags = new Map<string, boolean>();
  if (ids.length === 0) return flags;

  const includesSelf = ids.includes(actorId);
  const includesOthers = ids.some((id) => id !== actorId);
  const [selfCan, task] = await Promise.all([
    includesSelf ? canEditTask(actorId, taskId) : Promise.resolve(false),
    includesOthers ? canAccessTask(actorId, taskId) : Promise.resolve(null),
  ]);

  let othersCan = false;
  if (task?.workspaceId) {
    const membership = await getWorkspaceMembership(actorId, task.workspaceId);
    othersCan = canManageWorkspace(membership);
  }

  for (const id of ids) {
    flags.set(id, id === actorId ? selfCan : othersCan);
  }
  return flags;
}

export async function canStartTimer(actorId: string, taskId: string): Promise<boolean> {
  return canEditTask(actorId, taskId);
}

export async function canViewUserTimeEntries(
  actorId: string,
  targetUserId: string,
  workspaceId?: string | null
): Promise<boolean> {
  if (actorId === targetUserId) return true;
  if (!workspaceId) return false;
  const membership = await getWorkspaceMembership(actorId, workspaceId);
  return canManageWorkspace(membership);
}
