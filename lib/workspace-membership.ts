import { prisma } from "@/lib/prisma";

export async function getWorkspaceMembership(userId: string, workspaceId: string) {
  return prisma.workspaceMember.findFirst({
    where: { userId, workspaceId },
    include: {
      workspace: { select: { id: true, name: true, allowMemberInvites: true } },
    },
  });
}
