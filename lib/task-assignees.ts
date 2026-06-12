import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { taskListInclude } from "@/lib/tasks";

export async function validateWorkspaceAssignees(
  workspaceId: string,
  assigneeIds: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!assigneeIds.length) return { ok: true };

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, userId: { in: assigneeIds } },
    select: { userId: true },
  });
  const memberIds = new Set(members.map((m) => m.userId));
  const invalid = assigneeIds.filter((id) => !memberIds.has(id));
  if (invalid.length) {
    return { ok: false, error: "All assignees must be workspace members" };
  }
  return { ok: true };
}

export async function syncTaskAssignees(params: {
  taskId: string;
  workspaceId: string | null;
  assigneeIds: string[];
  primaryAssigneeId?: string | null;
  actorId: string;
  taskTitle?: string;
  workspaceName?: string;
}) {
  const { taskId, workspaceId, assigneeIds, actorId } = params;
  if (!workspaceId) {
    await prisma.taskAssignee.deleteMany({ where: { taskId } });
    return;
  }

  const uniqueIds = [...new Set(assigneeIds)];
  let primaryId = params.primaryAssigneeId ?? null;
  if (primaryId && !uniqueIds.includes(primaryId)) primaryId = uniqueIds[0] ?? null;
  if (!primaryId && uniqueIds.length === 1) primaryId = uniqueIds[0];

  const validation = await validateWorkspaceAssignees(workspaceId, uniqueIds);
  if (!validation.ok) throw new Error(validation.error);

  const existing = await prisma.taskAssignee.findMany({
    where: { taskId },
    select: { userId: true },
  });
  const existingIds = new Set(existing.map((e) => e.userId));
  const newIds = uniqueIds.filter((id) => !existingIds.has(id));
  const removedIds = [...existingIds].filter((id) => !uniqueIds.includes(id));

  await prisma.$transaction([
    prisma.taskAssignee.deleteMany({ where: { taskId } }),
    ...(uniqueIds.length
      ? [
          prisma.taskAssignee.createMany({
            data: uniqueIds.map((userId) => ({
              taskId,
              userId,
              isPrimary: userId === primaryId,
              assignedById: actorId,
            })),
          }),
        ]
      : []),
  ]);

  if (newIds.length && params.taskTitle) {
    const title = params.taskTitle;
    const body = params.workspaceName
      ? `You were assigned to "${title}" in ${params.workspaceName}`
      : `You were assigned to "${title}"`;
    for (const userId of newIds) {
      if (userId === actorId) continue;
      await createNotification({
        userId,
        title: "Task assignment",
        body,
        type: "task_assigned",
      });
    }
  }

  return { newIds, removedIds };
}

export async function getTaskWithAssignees(taskId: string) {
  return prisma.task.findUnique({
    where: { id: taskId },
    include: taskListInclude,
  });
}
