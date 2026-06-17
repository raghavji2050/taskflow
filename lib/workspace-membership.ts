import { prisma } from "@/lib/prisma";

type MembershipOptions = {
  allowArchived?: boolean;
};

export async function getWorkspaceMembership(
  userId: string,
  workspaceId: string,
  options?: MembershipOptions
) {
  return prisma.workspaceMember.findFirst({
    where: {
      userId,
      workspaceId,
      ...(options?.allowArchived ? {} : { workspace: { archivedAt: null } }),
    },
    include: {
      workspace: {
        select: { id: true, name: true, allowMemberInvites: true, archivedAt: true },
      },
    },
  });
}
