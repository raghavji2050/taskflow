"use client";

import { useEffect, useRef } from "react";

interface UseTimeRealtimeOptions {
  taskId?: string | null;
  workspaceId?: string | null;
  userId?: string | null;
  onEvent?: (detail: {
    type?: string;
    taskId?: string;
    workspaceId?: string | null;
    userId?: string;
    entry?: Record<string, unknown>;
  }) => void;
  enabled?: boolean;
}

export function useTimeRealtime({
  taskId,
  workspaceId,
  userId,
  onEvent,
  enabled = true,
}: UseTimeRealtimeOptions) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;

    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        type?: string;
        taskId?: string;
        workspaceId?: string | null;
        userId?: string;
        entry?: Record<string, unknown>;
      };

      if (taskId && detail.taskId !== taskId) return;
      if (workspaceId && detail.workspaceId !== workspaceId) return;
      if (userId && detail.userId !== userId) return;

      onEventRef.current?.(detail);
    };

    window.addEventListener("taskflow:time", handler);
    return () => window.removeEventListener("taskflow:time", handler);
  }, [enabled, taskId, workspaceId, userId]);
}
