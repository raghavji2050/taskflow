import { prisma } from "@/lib/prisma";
import { afterResponse } from "@/lib/after-response";
import { createNotification } from "@/lib/notifications";
import { parseMentionsFromBody } from "@/lib/mentions";
import { broadcastMessageToConversation } from "@/lib/realtime";
import { getConversationParticipantIds } from "@/lib/chat-access";
import type { formatMessageForClient } from "@/lib/message-format";
import { INBOUND_BOT_EMAIL } from "@/lib/inbound-webhook";

/** Push the author of a message when someone else reacts to it. */
export async function notifyMessageReaction(params: {
  conversationId: string;
  messageId: string;
  reactorId: string;
  reactorName: string;
  emoji: string;
}) {
  await afterResponse(async () => {
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

    await createNotification({
      userId: message.userId,
      title: params.reactorName,
      body,
      type: "reaction",
      conversationId: params.conversationId,
      messageId: params.messageId,
      icon: reactor?.image ?? undefined,
    });
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

  // Keep the request alive on serverless until FCM finishes (void was freezing
  // unfinished work for ~20–30s on Vercel). after() does not block the response.
  await afterResponse(() => deliverParticipantNotifications(params, allParticipantIds));
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

  const [sender, inboundBots] = await Promise.all([
    prisma.user.findUnique({
      where: { id: params.userId },
      select: { image: true },
    }),
    prisma.user.findMany({
      where: {
        OR: [
          { email: INBOUND_BOT_EMAIL },
          { email: { startsWith: "inbound+" } },
        ],
      },
      select: { id: true },
    }),
  ]);
  const senderIcon = sender?.image ?? undefined;
  const botIds = new Set(inboundBots.map((u) => u.id));

  // Skip per-recipient unread counts — that was an extra DB round-trip per user
  // before FCM. Push uses unreadCount=1 (sender as title); bell still upserts.
  await Promise.all([
    ...otherParticipantIds
      .filter((participantId) => !mentionedIds.has(participantId))
      .filter((participantId) => !botIds.has(participantId))
      .map((participantId) =>
        createNotification({
          userId: participantId,
          title: params.userName,
          body: params.preview,
          type: "message",
          conversationId: params.conversationId,
          messageId: params.messageId,
          conversationTitle: params.conversationTitle,
          unreadCount: 1,
          icon: senderIcon,
        })
      ),
    ...mentioned
      .filter((m) => m.id !== params.userId)
      .filter((m) => !botIds.has(m.id))
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
      ),
  ]);
}
