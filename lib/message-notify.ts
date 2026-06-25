import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { parseMentionsFromBody } from "@/lib/mentions";
import { broadcastMessageToConversation } from "@/lib/realtime";
import { getConversationParticipantIds } from "@/lib/chat-access";
import { getConversationUnreadCount } from "@/lib/conversations";
import { sendPushToUser } from "@/lib/push";
import type { formatMessageForClient } from "@/lib/message-format";

/** Push the author of a message when someone else reacts to it. */
export async function notifyMessageReaction(params: {
  conversationId: string;
  messageId: string;
  reactorId: string;
  reactorName: string;
  emoji: string;
}) {
  const message = await prisma.message.findUnique({
    where: { id: params.messageId },
    select: { userId: true, body: true, deletedAt: true },
  });
  if (!message || message.deletedAt) return;
  // Don't notify someone for reacting to their own message.
  if (message.userId === params.reactorId) return;

  const reactor = await prisma.user.findUnique({
    where: { id: params.reactorId },
    select: { image: true },
  });

  const snippet = (message.body ?? "").replace(/\s+/g, " ").trim();
  const shortSnippet = snippet.length > 60 ? `${snippet.slice(0, 60)}…` : snippet;
  const body = shortSnippet
    ? `Reacted ${params.emoji} to: ${shortSnippet}`
    : `Reacted ${params.emoji} to your message`;

  await sendPushToUser(message.userId, {
    title: params.reactorName,
    body,
    url: `/dashboard/messages?c=${params.conversationId}#msg-${params.messageId}`,
    icon: reactor?.image ?? undefined,
    conversationId: params.conversationId,
    messageId: params.messageId,
  });
}

export async function notifyParticipants(params: {
  conversationId: string;
  userId: string;
  userName: string;
  preview: string;
  conversationTitle: string;
  mentionCandidates: { id: string; name: string }[];
  body: string;
  messageId: string;
  message?: ReturnType<typeof formatMessageForClient>;
  type?: "message:created" | "message:updated";
}) {
  const allParticipantIds = await getConversationParticipantIds(params.conversationId);
  const eventType = params.type ?? "message:created";

  broadcastMessageToConversation(allParticipantIds, {
    conversationId: params.conversationId,
    messageId: params.messageId,
    actorId: params.userId,
    preview: params.preview,
    conversationTitle: params.conversationTitle,
    type: eventType,
    message: params.message,
  });

  if (eventType === "message:updated") return;

  void deliverParticipantNotifications(params, allParticipantIds);
}

async function deliverParticipantNotifications(
  params: {
    conversationId: string;
    userId: string;
    userName: string;
    preview: string;
    conversationTitle: string;
    body: string;
    messageId: string;
    mentionCandidates: { id: string; name: string }[];
  },
  allParticipantIds: string[]
) {
  const otherParticipantIds = allParticipantIds.filter((id) => id !== params.userId);
  const mentioned = parseMentionsFromBody(params.body, params.mentionCandidates);
  const mentionedIds = new Set(mentioned.map((m) => m.id));

  const sender = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { image: true },
  });
  const senderIcon = sender?.image ?? undefined;

  await Promise.all(
    otherParticipantIds
      .filter((participantId) => !mentionedIds.has(participantId))
      .map(async (participantId) => {
        const unreadCount = await getConversationUnreadCount(params.conversationId, participantId);
        return createNotification({
          userId: participantId,
          title: params.userName,
          body: params.preview,
          type: "message",
          conversationId: params.conversationId,
          messageId: params.messageId,
          conversationTitle: params.conversationTitle,
          unreadCount,
          icon: senderIcon,
        });
      })
  );

  await Promise.all(
    mentioned
      .filter((m) => m.id !== params.userId)
      .map((m) =>
        createNotification({
          userId: m.id,
          title: `${params.userName} mentioned you`,
          body: params.preview,
          type: "mention",
          conversationId: params.conversationId,
          messageId: params.messageId,
          icon: senderIcon,
        })
      )
  );
}
