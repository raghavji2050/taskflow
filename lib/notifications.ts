import { prisma } from "@/lib/prisma";
import { broadcastNotification } from "@/lib/realtime";
import { sendPushToUser } from "@/lib/push";
import { formatChatPushNotification } from "@/lib/chat-push-notification";

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
  conversationTitle?: string;
  unreadCount?: number;
  /** Avatar shown as the OS notification icon (e.g. the message sender's photo). */
  icon?: string | null;
}) {
  const type = params.type ?? "general";
  const icon = params.icon ?? undefined;

  if (type === "message") {
    const { title, body } = formatChatPushNotification({
      unreadCount: params.unreadCount ?? 1,
      senderName: params.title,
      conversationTitle: params.conversationTitle ?? params.title,
      preview: params.body,
    });
    await sendPushToUser(params.userId, {
      title,
      body,
      url: chatPushUrl(params.conversationId, params.messageId),
      icon,
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
      icon,
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
