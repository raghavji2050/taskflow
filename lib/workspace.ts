import { prisma } from "@/lib/prisma";
import { canEditWorkspaceTasks } from "@/lib/workspace-permissions";

export { canEditWorkspaceTasks } from "@/lib/workspace-permissions";

export async function getUserWorkspaceIds(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true },
  });
  return memberships.map((m) => m.workspaceId);
}

export async function isWorkspaceMember(userId: string, workspaceId: string) {
  const member = await prisma.workspaceMember.findFirst({
    where: { userId, workspaceId },
  });
  return !!member;
}

export async function getWorkspaceMembership(userId: string, workspaceId: string) {
  return prisma.workspaceMember.findFirst({
    where: { userId, workspaceId },
  });
}

export async function canAccessTask(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      OR: [
        { userId },
        { assignees: { some: { userId } } },
        { workspace: { members: { some: { userId } } } },
      ],
    },
  });
  return task;
}

export async function canEditTask(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId },
    select: { userId: true, workspaceId: true },
  });
  if (!task) return false;
  if (!task.workspaceId) return task.userId === userId;

  const membership = await getWorkspaceMembership(userId, task.workspaceId);
  return canEditWorkspaceTasks(membership);
}

export async function getWorkspaceMembers(workspaceId: string) {
  return prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
}
