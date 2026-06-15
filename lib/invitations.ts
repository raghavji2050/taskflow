import { InvitationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendEmail, workspaceInviteEmail } from "@/lib/email";
import { createNotification } from "@/lib/notifications";
import { configureWebPush, sendPushToSubscription } from "@/lib/push";
import { broadcastWorkspaceUpdate } from "@/lib/realtime";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function sendWorkspaceInvite(params: {
  workspaceId: string;
  inviterId: string;
  inviteeEmail: string;
}) {
  const { workspaceId, inviterId, inviteeEmail } = params;
  const email = inviteeEmail.trim().toLowerCase();

  const [workspace, inviter, invitee] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId } }),
    prisma.user.findUnique({ where: { id: inviterId }, select: { id: true, name: true } }),
    prisma.user.findUnique({ where: { email } }),
  ]);

  if (!workspace || !inviter) {
    return { error: "Workspace not found", status: 404 as const };
  }

  if (!invitee) {
    return { error: "No account found for that email. They need to register first.", status: 404 as const };
  }

  if (invitee.id === inviterId) {
    return { error: "You cannot invite yourself", status: 400 as const };
  }

  const existingMember = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: invitee.id },
  });
  if (existingMember) {
    return { error: "User is already a member of this workspace", status: 409 as const };
  }

  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  const invitation = await prisma.workspaceInvitation.upsert({
    where: {
      workspaceId_inviteeId: { workspaceId, inviteeId: invitee.id },
    },
    create: {
      workspaceId,
      inviteeId: invitee.id,
      inviterId,
      status: InvitationStatus.PENDING,
      expiresAt,
    },
    update: {
      inviterId,
      status: InvitationStatus.PENDING,
      expiresAt,
      createdAt: new Date(),
    },
    include: {
      workspace: { select: { id: true, name: true } },
      inviter: { select: { id: true, name: true } },
      invitee: { select: { id: true, name: true, email: true } },
    },
  });

  await prisma.notification.deleteMany({
    where: { inviteId: invitation.id, userId: invitee.id },
  });

  await createNotification({
    userId: invitee.id,
    title: "Workspace invitation",
    body: `${inviter.name} invited you to join "${workspace.name}"`,
    type: "workspace_invite",
    inviteId: invitation.id,
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const dashboardUrl = `${baseUrl}/dashboard`;

  try {
    await sendEmail(
      invitee.email,
      `Invitation to join ${workspace.name} on TaskFlow`,
      workspaceInviteEmail(invitee.name, inviter.name, workspace.name, dashboardUrl)
    );
  } catch (error) {
    console.error("[Invite] Email failed:", error);
  }

  if (configureWebPush()) {
    const subs = await prisma.pushSubscription.findMany({ where: { userId: invitee.id } });
    for (const sub of subs) {
      try {
        await sendPushToSubscription(sub, {
          title: "Workspace invitation",
          body: `${inviter.name} invited you to "${workspace.name}"`,
          url: "/dashboard",
        });
      } catch {
        await prisma.pushSubscription.delete({ where: { id: sub.id } });
      }
    }
  }

  broadcastWorkspaceUpdate({
    workspaceId,
    reason: "invite_sent",
    actorId: inviterId,
  });

  return { invitation, status: 201 as const };
}

export async function acceptInvitation(invitationId: string, userId: string) {
  const invitation = await prisma.workspaceInvitation.findUnique({
    where: { id: invitationId },
    include: { workspace: true, inviter: { select: { id: true, name: true } } },
  });

  if (!invitation || invitation.inviteeId !== userId) {
    return { error: "Invitation not found", status: 404 as const };
  }

  if (invitation.status !== InvitationStatus.PENDING) {
    return { error: "Invitation is no longer pending", status: 400 as const };
  }

  if (invitation.expiresAt < new Date()) {
    return { error: "Invitation has expired", status: 400 as const };
  }

  const invitee = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });

  const existingMember = await prisma.workspaceMember.findFirst({
    where: { workspaceId: invitation.workspaceId, userId },
  });

  const memberOps = existingMember
    ? []
    : [
        prisma.workspaceMember.create({
          data: { workspaceId: invitation.workspaceId, userId, role: "MEMBER" },
        }),
      ];

  await prisma.$transaction([
    ...memberOps,
    prisma.workspaceInvitation.update({
      where: { id: invitationId },
      data: { status: InvitationStatus.ACCEPTED },
    }),
    prisma.notification.updateMany({
      where: { inviteId: invitationId, userId },
      data: { read: true },
    }),
  ]);

  const { addUserToWorkspaceChannel } = await import("@/lib/conversations");
  await addUserToWorkspaceChannel(invitation.workspaceId, userId);

  await createNotification({
    userId: invitation.inviterId,
    title: "Invitation accepted",
    body: `${invitee?.name ?? "A member"} joined "${invitation.workspace.name}"`,
    type: "general",
  });

  broadcastWorkspaceUpdate({
    workspaceId: invitation.workspaceId,
    reason: "invite_accepted",
    actorId: userId,
    notifyUserIds: [userId],
  });

  return { workspace: invitation.workspace, status: 200 as const };
}

export async function declineInvitation(invitationId: string, userId: string) {
  const invitation = await prisma.workspaceInvitation.findUnique({
    where: { id: invitationId },
    include: { workspace: true, invitee: { select: { name: true } } },
  });

  if (!invitation || invitation.inviteeId !== userId) {
    return { error: "Invitation not found", status: 404 as const };
  }

  if (invitation.status !== InvitationStatus.PENDING) {
    return { error: "Invitation is no longer pending", status: 400 as const };
  }

  await prisma.$transaction([
    prisma.workspaceInvitation.update({
      where: { id: invitationId },
      data: { status: InvitationStatus.DECLINED },
    }),
    prisma.notification.updateMany({
      where: { inviteId: invitationId, userId },
      data: { read: true },
    }),
  ]);

  await createNotification({
    userId: invitation.inviterId,
    title: "Invitation declined",
    body: `${invitation.invitee.name} declined to join "${invitation.workspace.name}"`,
    type: "general",
  });

  broadcastWorkspaceUpdate({
    workspaceId: invitation.workspaceId,
    reason: "invite_declined",
    actorId: userId,
  });

  return { status: 200 as const };
}
