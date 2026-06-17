import { createNotification } from "@/lib/notifications";
import { parseMentionsFromBody } from "@/lib/mentions";
import { broadcastMessageToConversation } from "@/lib/realtime";
import { getConversationParticipantIds } from "@/lib/chat-access";
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
    type: eventType,
    message: params.message,
  });

  if (eventType === "message:updated") return;

  const otherParticipantIds = allParticipantIds.filter((id) => id !== params.userId);
  const mentioned = parseMentionsFromBody(params.body, params.mentionCandidates);
  const mentionedIds = new Set(mentioned.map((m) => m.id));

  for (const participantId of otherParticipantIds) {
    if (mentionedIds.has(participantId)) continue;

    await createNotification({
      userId: participantId,
      title: params.userName,
      body: params.preview,
      type: "message",
      conversationId: params.conversationId,
      messageId: params.messageId,
    });
  }

  for (const m of mentioned) {
    if (m.id === params.userId) continue;

    await createNotification({
      userId: m.id,
      title: `${params.userName} mentioned you`,
      body: params.preview,
      type: "mention",
      conversationId: params.conversationId,
      messageId: params.messageId,
    });
  }
}
