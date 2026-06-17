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
  if (entry.userId === actorId) {
    return canEditTask(actorId, entry.taskId);
  }

  const task = await canAccessTask(actorId, entry.taskId);
  if (!task?.workspaceId) return false;

  const membership = await getWorkspaceMembership(actorId, task.workspaceId);
  return canManageWorkspace(membership);
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
