import { prisma } from "@/lib/prisma";
import { broadcastNotification } from "@/lib/realtime";
import { sendPushToUser } from "@/lib/push";
import { formatChatPushNotification } from "@/lib/chat-push-notification";
import { plainMessagePreview } from "@/lib/markdown-plain";

function chatPushUrl(conversationId?: string, messageId?: string) {
  if (!conversationId) return "/dashboard/messages";
  const base = `/dashboard/messages?c=${conversationId}`;
  return messageId ? `${base}#msg-${messageId}` : base;
}

/**
 * Upsert one unread "message" notification per conversation so the bell
 * shows catch-up when the user returns online without flooding the list.
 */
async function upsertMessageNotification(params: {
  userId: string;
  title: string;
  body: string;
  conversationId: string;
  messageId?: string;
}) {
  const existing = await prisma.notification.findFirst({
    where: {
      userId: params.userId,
      conversationId: params.conversationId,
      type: "message",
      read: false,
      archivedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return prisma.notification.update({
      where: { id: existing.id },
      data: {
        title: params.title,
        body: params.body,
        messageId: params.messageId,
        createdAt: new Date(),
      },
    });
  }

  return prisma.notification.create({
    data: {
      userId: params.userId,
      title: params.title,
      body: params.body,
      type: "message",
      conversationId: params.conversationId,
      messageId: params.messageId,
    },
  });
}

/** Mark chat-related notifications as read when the user opens that conversation. */
export async function markConversationNotificationsRead(
  userId: string,
  conversationId: string
) {
  await prisma.notification.updateMany({
    where: {
      userId,
      conversationId,
      read: false,
      archivedAt: null,
      type: { in: ["message", "mention", "reaction"] },
    },
    data: { read: true },
  });
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

  let notificationTitle = params.title;
  let notificationBody = params.body;

  if (type === "message") {
    const formatted = formatChatPushNotification({
      unreadCount: params.unreadCount ?? 1,
      senderName: params.title,
      conversationTitle: params.conversationTitle ?? params.title,
      preview: params.body,
    });
    notificationTitle = formatted.title;
    notificationBody = formatted.body;
  } else if (type === "mention" || type === "reaction") {
    // Keep title (sender / "X mentioned you"); strip markdown from body for bell + push.
    notificationBody = plainMessagePreview(params.body, 180);
  }

  const url =
    type === "timer_still_running" || type === "task_assigned" || type === "workspace_invite"
      ? "/dashboard"
      : type === "message" || type === "mention" || type === "reaction"
        ? chatPushUrl(params.conversationId, params.messageId)
        : params.conversationId
          ? chatPushUrl(params.conversationId, params.messageId)
          : "/dashboard";

  broadcastNotification(params.userId, {
    title: notificationTitle,
    body: notificationBody,
    notificationType: type,
    conversationId: params.conversationId,
    messageId: params.messageId,
  });

  // Persist bell row and FCM in parallel — don't block push on the DB write.
  const persistPromise =
    type === "message" && params.conversationId
      ? upsertMessageNotification({
          userId: params.userId,
          title: notificationTitle,
          body: notificationBody,
          conversationId: params.conversationId,
          messageId: params.messageId,
        })
      : prisma.notification.create({
          data: {
            userId: params.userId,
            title: notificationTitle,
            body: notificationBody,
            type,
            inviteId: params.inviteId,
            conversationId: params.conversationId,
            messageId: params.messageId,
          },
        });

  const [, notification] = await Promise.all([
    sendPushToUser(params.userId, {
      title: notificationTitle,
      body: notificationBody,
      url,
      icon,
      conversationId: params.conversationId,
      messageId: params.messageId,
    }),
    persistPromise,
  ]);

  return notification;
}
