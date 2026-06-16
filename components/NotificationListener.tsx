"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { getActiveConversationId } from "@/lib/active-chat";

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
  message?: { user?: { name?: string } };
}

export function NotificationListener() {
  const router = useRouter();
  const { data: session } = useSession();
  const userId = session?.user?.id;

  useEffect(() => {
    const openChat = (conversationId?: string, messageId?: string) => {
      if (!conversationId) return;
      const path = `/dashboard/messages?c=${conversationId}${
        messageId ? `#msg-${messageId}` : ""
      }`;
      router.push(path);
    };

    const notificationHandler = (event: Event) => {
      const detail = (event as CustomEvent<NotificationDetail>).detail;
      if (!detail?.notificationType) return;
      if (document.hidden) return;

      const openFromNotification = () => openChat(detail.conversationId, detail.messageId);

      if (detail.notificationType === "mention") {
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
      if (document.hidden) return;

      const senderName = detail.message?.user?.name ?? "New message";
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
    };
  }, [router, userId]);

  return null;
}
