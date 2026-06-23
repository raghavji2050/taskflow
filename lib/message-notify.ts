import { createNotification } from "@/lib/notifications";
import { parseMentionsFromBody } from "@/lib/mentions";
import { broadcastMessageToConversation } from "@/lib/realtime";
import { getConversationParticipantIds } from "@/lib/chat-access";
import { getConversationUnreadCount } from "@/lib/conversations";
import type { formatMessageForClient } from "@/lib/message-format";

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
        })
      )
  );
}
