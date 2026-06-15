"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface NotificationDetail {
  title?: string;
  body?: string;
  notificationType?: string;
  conversationId?: string;
  messageId?: string;
}

export function NotificationListener() {
  const router = useRouter();

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<NotificationDetail>).detail;
      if (!detail?.notificationType) return;

      const openChat = () => {
        if (!detail.conversationId) return;
        const path = `/dashboard/messages?c=${detail.conversationId}${
          detail.messageId ? `#msg-${detail.messageId}` : ""
        }`;
        router.push(path);
      };

      if (detail.notificationType === "mention") {
        toast(detail.title ?? "You were mentioned", {
          description: detail.body,
          action: detail.conversationId
            ? { label: "Open chat", onClick: openChat }
            : undefined,
        });
        return;
      }

      if (detail.notificationType === "message") {
        toast(detail.title ?? "New message", {
          description: detail.body,
          action: detail.conversationId
            ? { label: "Open chat", onClick: openChat }
            : undefined,
        });
      }
    };

    window.addEventListener("taskflow:notification", handler);
    return () => window.removeEventListener("taskflow:notification", handler);
  }, [router]);

  return null;
}
