"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { TaskEvent } from "@/lib/realtime";
import {
  dispatchRealtimeMessage,
  type RealtimeWireMessage,
} from "@/lib/realtime-client";
import { setRealtimeWebSocket } from "@/lib/realtime-ws-client";
import {
  connectPusher,
  disconnectPusher,
  isPusherClientConfigured,
} from "@/lib/pusher-client";

interface RealtimeContextValue {
  connected: boolean;
  transport: "pusher" | "websocket" | "sse" | "none";
  subscribe: (handler: (event: TaskEvent) => void) => () => void;
  isUserOnline: (userId: string) => boolean;
  countOnline: (userIds: string[], excludeUserId?: string) => number;
  presenceVersion: number;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [connected, setConnected] = useState(false);
  const [transport, setTransport] = useState<"pusher" | "websocket" | "sse" | "none">("none");
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(() => new Set());
  const [presenceVersion, setPresenceVersion] = useState(0);
  const handlersRef = useRef(new Set<(event: TaskEvent) => void>());
  const sessionUserIdRef = useRef<string | undefined>(session?.user?.id);
  sessionUserIdRef.current = session?.user?.id;

  const applyOnlineUserIds = useCallback((ids: string[], detail?: object) => {
    setOnlineUserIds((prev) => {
      const next = new Set(ids);
      if (next.size === prev.size && ids.every((id) => prev.has(id))) return prev;
      queueMicrotask(() => {
        setPresenceVersion((v) => v + 1);
        if (detail) {
          window.dispatchEvent(new CustomEvent("taskflow:presence", { detail }));
        }
      });
      return next;
    });
  }, []);

  const applyPresenceChanged = useCallback((userId: string, online: boolean) => {
    setOnlineUserIds((prev) => {
      const has = prev.has(userId);
      if ((online && has) || (!online && !has)) return prev;
      const next = new Set(prev);
      if (online) next.add(userId);
      else next.delete(userId);
      queueMicrotask(() => {
        setPresenceVersion((v) => v + 1);
        window.dispatchEvent(
          new CustomEvent("taskflow:presence", { detail: { userId, online } })
        );
      });
      return next;
    });
  }, []);

  const isUserOnline = useCallback(
    (userId: string) => onlineUserIds.has(userId),
    [onlineUserIds]
  );

  const countOnline = useCallback(
    (userIds: string[], excludeUserId?: string) =>
      userIds.filter((id) => id !== excludeUserId && onlineUserIds.has(id)).length,
    [onlineUserIds]
  );

  const markOnline = useCallback((userId: string) => {
    setOnlineUserIds((prev) => {
      if (prev.has(userId)) return prev;
      const next = new Set(prev);
      next.add(userId);
      setPresenceVersion((v) => v + 1);
      return next;
    });
  }, []);

  const subscribe = useCallback((handler: (event: TaskEvent) => void) => {
    handlersRef.current.add(handler);
    return () => handlersRef.current.delete(handler);
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) {
      setConnected(false);
      setTransport("none");
      setOnlineUserIds(new Set());
      return;
    }

    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let ws: WebSocket | null = null;
    let source: EventSource | null = null;
    let useSse = false;
    let pusherCleanup: (() => void) | null = null;

    const dispatchCtx = () => ({
      sessionUserId: sessionUserIdRef.current,
      markOnline,
      setConnected,
      applyOnlineUserIds,
      applyPresenceChanged,
      onTaskEvent: (event: TaskEvent) => {
        handlersRef.current.forEach((handler) => handler(event));
      },
    });

    const handlePayload = (raw: string) => {
      try {
        const data = JSON.parse(raw);
        dispatchRealtimeMessage(data, dispatchCtx());
      } catch {
        // ignore malformed payloads
      }
    };

    const handleRealtime = (data: object) => {
      dispatchRealtimeMessage(data as RealtimeWireMessage, dispatchCtx());
    };

    const scheduleReconnect = (delayMs = 3000) => {
      if (disposed) return;
      setConnected(false);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, delayMs);
    };

    const connectSse = () => {
      if (disposed || source) return;
      useSse = true;
      setTransport("sse");
      source = new EventSource("/api/events");
      source.onmessage = (message) => handlePayload(message.data);
      source.onopen = () => {
        setConnected(true);
      };
      source.onerror = () => {
        source?.close();
        source = null;
        setConnected(false);
        scheduleReconnect(5000);
      };
    };

    const connectWs = () => {
      if (disposed || ws) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${protocol}//${window.location.host}/api/ws`);

      ws.onopen = () => {
        useSse = false;
        setTransport("websocket");
        setConnected(true);
        setRealtimeWebSocket(ws);
      };

      ws.onmessage = (event) => handlePayload(String(event.data));

      ws.onerror = () => {
        if (ws?.readyState === WebSocket.OPEN) return;
        ws?.close();
      };

      ws.onclose = () => {
        setRealtimeWebSocket(null);
        ws = null;
        setConnected(false);
        if (disposed) return;
        if (!useSse) {
          useSse = true;
          connectSse();
        } else {
          scheduleReconnect(5000);
        }
      };
    };

    const connectPusherTransport = async () => {
      if (disposed) return;
      try {
        const res = await fetch("/api/workspaces");
        if (!res.ok || disposed) {
          scheduleReconnect(5000);
          return;
        }
        const data = await res.json();
        const workspaceIds = (data.workspaces as { id: string }[]).map((w) => w.id);
        if (disposed) return;

        setTransport("pusher");
        pusherCleanup = connectPusher(
          session.user.id,
          workspaceIds,
          handleRealtime,
          setConnected
        );
      } catch {
        if (!disposed) scheduleReconnect(5000);
      }
    };

    const connect = () => {
      if (disposed) return;
      if (isPusherClientConfigured()) {
        void connectPusherTransport();
      } else if (useSse) {
        connectSse();
      } else {
        connectWs();
      }
    };

    connect();

    const handlePageHide = () => {
      disposed = true;
      ws?.close();
      source?.close();
      ws = null;
      source = null;
      pusherCleanup?.();
      disconnectPusher();
    };
    window.addEventListener("pagehide", handlePageHide);

    const onChatMessage = (event: Event) => {
      const senderId = (event as CustomEvent<{ senderId?: string }>).detail?.senderId;
      if (senderId) markOnline(senderId);
    };
    window.addEventListener("taskflow:message", onChatMessage);

    return () => {
      disposed = true;
      setConnected(false);
      setTransport("none");
      setOnlineUserIds(new Set());
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("taskflow:message", onChatMessage);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      source?.close();
      pusherCleanup?.();
      disconnectPusher();
    };
  }, [status, session?.user?.id, markOnline, applyOnlineUserIds, applyPresenceChanged]);

  return (
    <RealtimeContext.Provider
      value={{ connected, transport, subscribe, isUserOnline, countOnline, presenceVersion }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used within RealtimeProvider");
  return ctx;
}
