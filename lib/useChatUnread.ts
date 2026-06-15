"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

export function useChatUnread() {
  const { status } = useSession();
  const [totalUnread, setTotalUnread] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const onMessage = () => debouncedRefresh();
    const onUnread = () => debouncedRefresh();
    window.addEventListener("taskflow:message", onMessage);
    window.addEventListener("taskflow:chat-unread", onUnread);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      window.removeEventListener("taskflow:message", onMessage);
      window.removeEventListener("taskflow:chat-unread", onUnread);
    };
  }, [debouncedRefresh]);

  return { totalUnread, refresh };
}
