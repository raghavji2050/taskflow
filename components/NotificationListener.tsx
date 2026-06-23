"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { getActiveConversationId } from "@/lib/active-chat";
import { showBrowserNotification } from "@/lib/browser-notifications";
import {
  bumpChatNotificationCount,
  formatChatPushNotification,
} from "@/lib/chat-push-notification";
import { hasActivePushSubscription } from "@/lib/push-client";

interface NotificationDetail {
  title?: string;
  body?: string;
  notificationType?: string;
  conversationId?: string;
  messageId?: string;
}

interface MessageDetail {
  type?: string;
  conversationId?: string;
  messageId?: string;
  senderId?: string;
  preview?: string;
  conversationTitle?: string;
  message?: { user?: { name?: string } };
}

function chatUrl(conversationId: string, messageId?: string) {
  const base = `/dashboard/messages?c=${conversationId}`;
  return messageId ? `${base}#msg-${messageId}` : base;
}

export function NotificationListener() {
  const router = useRouter();
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const pushActiveRef = useRef(false);

  useEffect(() => {
    const refreshPushState = () => {
      void hasActivePushSubscription().then((active) => {
        pushActiveRef.current = active;
      });
    };

    refreshPushState();
    window.addEventListener("taskflow:push-status", refreshPushState);

    const openChat = (conversationId?: string, messageId?: string) => {
      if (!conversationId) return;
      router.push(chatUrl(conversationId, messageId));
    };

    const maybeShowOsNotification = (
      title: string,
      options: {
        body?: string;
        url?: string;
        conversationId?: string;
        messageId?: string;
        tag?: string;
      }
    ) => {
      if (!document.hidden) return;
      // Web Push + service worker already shows OS notifications when subscribed.
      if (pushActiveRef.current) return;
      showBrowserNotification(title, options);
    };

    const notificationHandler = (event: Event) => {
      const detail = (event as CustomEvent<NotificationDetail>).detail;
      if (!detail?.notificationType) return;

      const openFromNotification = () => openChat(detail.conversationId, detail.messageId);

      if (detail.notificationType === "mention") {
        if (document.hidden) {
          maybeShowOsNotification(detail.title ?? "You were mentioned", {
            body: detail.body,
            url: detail.conversationId
              ? chatUrl(detail.conversationId, detail.messageId)
              : "/dashboard/messages",
            conversationId: detail.conversationId,
            messageId: detail.messageId,
            tag: detail.conversationId ? `chat-${detail.conversationId}` : "taskflow",
          });
          return;
        }

        toast(detail.title ?? "You were mentioned", {
          description: detail.body,
          action: detail.conversationId
            ? { label: "Open chat", onClick: openFromNotification }
            : undefined,
        });
      }
    };

    const messageHandler = (event: Event) => {
      const detail = (event as CustomEvent<MessageDetail>).detail;
      if (detail?.type !== "message:created") return;
      if (!detail.conversationId || !detail.senderId) return;
      if (detail.senderId === userId) return;
      if (detail.conversationId === getActiveConversationId()) return;

      const senderName = detail.message?.user?.name ?? "New message";
      const preview = detail.preview ?? "New message";

      if (document.hidden) {
        const unreadCount = bumpChatNotificationCount(detail.conversationId);
        const { title, body } = formatChatPushNotification({
          unreadCount,
          senderName,
          conversationTitle: detail.conversationTitle ?? senderName,
          preview,
        });
        maybeShowOsNotification(title, {
          body,
          url: chatUrl(detail.conversationId, detail.messageId),
          conversationId: detail.conversationId,
          messageId: detail.messageId,
          tag: `chat-${detail.conversationId}`,
        });
        return;
      }

      toast(senderName, {
        description: detail.preview,
        action: {
          label: "Open chat",
          onClick: () => openChat(detail.conversationId, detail.messageId),
        },
      });
    };

    window.addEventListener("taskflow:notification", notificationHandler);
    window.addEventListener("taskflow:message", messageHandler);
    return () => {
      window.removeEventListener("taskflow:notification", notificationHandler);
      window.removeEventListener("taskflow:message", messageHandler);
      window.removeEventListener("taskflow:push-status", refreshPushState);
    };
  }, [router, userId]);

  return null;
}
