import { ConversationType, WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getWorkspaceMembership } from "@/lib/workspace";

export async function getConversationParticipant(userId: string, conversationId: string) {
  return prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    include: {
      conversation: {
        include: {
          workspace: { select: { id: true, name: true } },
          participants: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
        },
      },
    },
  });
}

export async function canAccessConversation(userId: string, conversationId: string) {
  const participant = await getConversationParticipant(userId, conversationId);
  if (!participant) return null;

  const { conversation } = participant;

  if (conversation.type === ConversationType.WORKSPACE && conversation.workspaceId) {
    const membership = await getWorkspaceMembership(userId, conversation.workspaceId);
    if (!membership) return null;
  }

  return participant;
}

export async function canPostToConversation(userId: string, conversationId: string) {
  const participant = await canAccessConversation(userId, conversationId);
  if (!participant) return null;

  const { conversation } = participant;

  if (conversation.type === ConversationType.WORKSPACE && conversation.workspaceId) {
    const membership = await getWorkspaceMembership(userId, conversation.workspaceId);
    if (!membership || membership.role === WorkspaceRole.VIEWER) return null;
  }

  return participant;
}

export async function getConversationParticipantIds(conversationId: string) {
  const rows = await prisma.conversationParticipant.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}
