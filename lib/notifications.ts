import { prisma } from "@/lib/prisma";
import { broadcastNotification } from "@/lib/realtime";
import { sendPushToUser } from "@/lib/push";

function chatPushUrl(conversationId?: string, messageId?: string) {
  if (!conversationId) return "/dashboard/messages";
  const base = `/dashboard/messages?c=${conversationId}`;
  return messageId ? `${base}#msg-${messageId}` : base;
}

export async function createNotification(params: {
  userId: string;
  title: string;
  body: string;
  type?: string;
  inviteId?: string;
  conversationId?: string;
  messageId?: string;
}) {
  const type = params.type ?? "general";

  if (type === "message") {
    await sendPushToUser(params.userId, {
      title: params.title,
      body: params.body,
      url: chatPushUrl(params.conversationId, params.messageId),
      conversationId: params.conversationId,
      messageId: params.messageId,
    });
    return null;
  }

  const notification = await prisma.notification.create({
    data: {
      userId: params.userId,
      title: params.title,
      body: params.body,
      type,
      inviteId: params.inviteId,
      conversationId: params.conversationId,
      messageId: params.messageId,
    },
  });

  broadcastNotification(params.userId, {
    title: params.title,
    body: params.body,
    notificationType: type,
    conversationId: params.conversationId,
    messageId: params.messageId,
  });

  if (type === "mention") {
    await sendPushToUser(params.userId, {
      title: params.title,
      body: params.body,
      url: chatPushUrl(params.conversationId, params.messageId),
      conversationId: params.conversationId,
      messageId: params.messageId,
    });
  }

  if (type === "timer_still_running") {
    await sendPushToUser(params.userId, {
      title: params.title,
      body: params.body,
      url: "/dashboard",
    });
  }

  return notification;
}
