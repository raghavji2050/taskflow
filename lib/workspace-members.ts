import { InvitationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { broadcastWorkspaceUpdate } from "@/lib/realtime";

export async function removeWorkspaceMember(params: {
  workspaceId: string;
  memberId: string;
  actorId: string;
}) {
  const { workspaceId, memberId, actorId } = params;

  const target = await prisma.workspaceMember.findFirst({
    where: { id: memberId, workspaceId },
    include: {
      user: { select: { id: true, name: true } },
      workspace: { select: { id: true, name: true } },
    },
  });

  if (!target) {
    return { error: "Member not found", status: 404 as const };
  }

  if (target.role === "OWNER") {
    return { error: "The workspace owner cannot be removed", status: 400 as const };
  }

  if (target.userId === actorId) {
    return { error: "Use leave workspace to remove yourself", status: 400 as const };
  }

  await prisma.$transaction([
    prisma.workspaceMember.delete({ where: { id: memberId } }),
    prisma.workspaceInvitation.updateMany({
      where: { workspaceId, inviteeId: target.userId, status: InvitationStatus.PENDING },
      data: { status: InvitationStatus.DECLINED },
    }),
    prisma.notification.updateMany({
      where: {
        userId: target.userId,
        invite: { workspaceId, status: InvitationStatus.PENDING },
      },
      data: { read: true },
    }),
  ]);

  await createNotification({
    userId: target.userId,
    title: "Workspace access removed",
    body: `You no longer have access to "${target.workspace.name}"`,
    type: "general",
  });

  broadcastWorkspaceUpdate({
    workspaceId,
    reason: "member_removed",
    actorId,
    notifyUserIds: [target.userId],
  });

  return { member: target, status: 200 as const };
}

export async function revokeWorkspaceInvitation(params: {
  invitationId: string;
  actorId: string;
}) {
  const { invitationId, actorId } = params;

  const invitation = await prisma.workspaceInvitation.findUnique({
    where: { id: invitationId },
    include: {
      workspace: { select: { id: true, name: true } },
      invitee: { select: { id: true, name: true, email: true } },
    },
  });

  if (!invitation) {
    return { error: "Invitation not found", status: 404 as const };
  }

  if (invitation.status !== InvitationStatus.PENDING) {
    return { error: "Only pending invitations can be revoked", status: 400 as const };
  }

  await prisma.$transaction([
    prisma.workspaceInvitation.update({
      where: { id: invitationId },
      data: { status: InvitationStatus.DECLINED },
    }),
    prisma.notification.updateMany({
      where: { inviteId: invitationId, userId: invitation.inviteeId },
      data: { read: true },
    }),
  ]);

  await createNotification({
    userId: invitation.inviteeId,
    title: "Invitation revoked",
    body: `Your invitation to join "${invitation.workspace.name}" was cancelled`,
    type: "general",
  });

  broadcastWorkspaceUpdate({
    workspaceId: invitation.workspaceId,
    reason: "invite_revoked",
    actorId,
    notifyUserIds: [invitation.inviteeId],
  });

  return { invitation, status: 200 as const };
}
