"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

export function useChatUnread() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [totalUnread, setTotalUnread] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionUserIdRef = useRef(session?.user?.id);
  sessionUserIdRef.current = session?.user?.id;

  const refresh = useCallback(async () => {
    if (status !== "authenticated") {
      setTotalUnread(0);
      return;
    }
    const res = await fetch("/api/conversations/unread");
    const data = await res.json();
    if (res.ok) setTotalUnread(data.totalUnread ?? 0);
  }, [status]);

  const debouncedRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void refresh(), 400);
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (pathname?.startsWith("/dashboard/messages")) {
      void refresh();
    }
  }, [pathname, refresh]);

  useEffect(() => {
    const onMessage = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        type?: string;
        conversationId?: string;
        senderId?: string;
      };
      if (
        detail?.type === "message:created" &&
        detail.conversationId &&
        detail.senderId &&
        detail.senderId !== sessionUserIdRef.current
      ) {
        debouncedRefresh();
      }
    };
    const onUnread = () => {
      void refresh();
    };
    window.addEventListener("taskflow:message", onMessage);
    window.addEventListener("taskflow:chat-unread", onUnread);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      window.removeEventListener("taskflow:message", onMessage);
      window.removeEventListener("taskflow:chat-unread", onUnread);
    };
  }, [debouncedRefresh, refresh]);

  return { totalUnread, refresh };
}
