import { prisma } from "@/lib/prisma";

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

export async function canAccessTask(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      OR: [
        { userId },
        { assigneeId: userId },
        { workspace: { members: { some: { userId } } } },
      ],
    },
  });
  return task;
}

export async function getWorkspaceMembers(workspaceId: string) {
  return prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
}
