"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { TaskEvent } from "@/lib/realtime";

interface SseMessage {
  type: string;
  workspaceId?: string | null;
  actorId?: string;
  ownerId?: string;
  taskId?: string;
  at?: string;
}

interface RealtimeContextValue {
  connected: boolean;
  subscribe: (handler: (event: TaskEvent) => void) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef(new Set<(event: TaskEvent) => void>());

  const subscribe = useCallback((handler: (event: TaskEvent) => void) => {
    handlersRef.current.add(handler);
    return () => handlersRef.current.delete(handler);
  }, []);

  useEffect(() => {
    if (status !== "authenticated") {
      setConnected(false);
      return;
    }

    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      source = new EventSource("/api/events");

      source.onmessage = (message) => {
        try {
          const data = JSON.parse(message.data) as SseMessage;
          if (data.type === "connected") {
            setConnected(true);
            return;
          }
          if (data.type === "heartbeat") return;
          if (data.type === "notification:new") {
            window.dispatchEvent(new CustomEvent("taskflow:notification"));
            return;
          }
          if (
            data.type === "workspace:updated" ||
            data.type === "workspace:membership_changed"
          ) {
            window.dispatchEvent(
              new CustomEvent("taskflow:workspace", {
                detail: { workspaceId: data.workspaceId, type: data.type },
              })
            );
            return;
          }
          if (data.type?.startsWith("task:") || data.type === "comment:created") {
            handlersRef.current.forEach((handler) =>
              handler(data as TaskEvent)
            );
          }
        } catch {
          // ignore malformed payloads
        }
      };

      source.onerror = () => {
        setConnected(false);
        source?.close();
        source = null;
        if (!disposed) reconnectTimer = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      disposed = true;
      setConnected(false);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      source?.close();
    };
  }, [status]);

  return (
    <RealtimeContext.Provider value={{ connected, subscribe }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used within RealtimeProvider");
  return ctx;
}
