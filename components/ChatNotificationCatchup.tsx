"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { getActiveConversationId } from "@/lib/active-chat";
import {
  showBrowserNotification,
  shouldNotifyConversation,
} from "@/lib/browser-notifications";

function chatUrl(conversationId: string) {
  return `/dashboard/messages?c=${conversationId}`;
}

export function ChatNotificationCatchup() {
  const pathname = usePathname();
  const wasHiddenRef = useRef(false);

  const runCatchup = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (document.visibilityState !== "visible") return;
    if (Notification.permission !== "granted") return;

    try {
      const res = await fetch("/api/conversations");
      const data = await res.json();
      if (!res.ok) return;

      const conversations = Array.isArray(data.conversations) ? data.conversations : [];
      const activeId = getActiveConversationId();

      for (const conv of conversations) {
        if (!conv.id || !conv.unreadCount || conv.unreadCount <= 0) continue;
        if (conv.id === activeId) continue;
        if (!shouldNotifyConversation(conv.id)) continue;

        const preview = conv.lastMessage?.body?.slice(0, 120) ?? "New messages";
        const sender = conv.lastMessage?.user?.name ?? conv.name ?? "Chat";

        showBrowserNotification(`New in ${conv.name ?? "chat"}`, {
          body: `${sender}: ${preview}`,
          url: chatUrl(conv.id),
          conversationId: conv.id,
          messageId: conv.lastMessage?.id,
          tag: `chat-catchup-${conv.id}`,
        });
      }
    } catch {
      // ignore fetch errors during catch-up
    }
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        wasHiddenRef.current = true;
        return;
      }
      if (document.visibilityState === "visible" && wasHiddenRef.current) {
        wasHiddenRef.current = false;
        void runCatchup();
      }
    };

    const onOnline = () => {
      if (document.visibilityState === "visible") void runCatchup();
    };

    window.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);

    return () => {
      window.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
    };
  }, [runCatchup, pathname]);

  return null;
}
