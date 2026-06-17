"use client";

import { useCallback, useState } from "react";
import { useLiveTimer } from "@/lib/useLiveTimer";
import { useTimeRealtime } from "@/lib/useTimeRealtime";
import { useEffect } from "react";

export interface ActiveTimerEntry {
  id: string;
  startTime: string;
  isRunning: boolean;
  description?: string | null;
  taskId?: string;
  task?: { id: string; title: string; status?: string };
}

export function useActiveTimer() {
  const [entry, setEntry] = useState<ActiveTimerEntry | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/time/active");
    const data = await res.json();
    if (res.ok) setEntry(data.entry ?? null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useTimeRealtime({ onEvent: () => void refresh() });

  const elapsed = useLiveTimer(entry?.startTime, Boolean(entry?.isRunning));

  const isRunningOnTask = useCallback(
    (taskId: string) => Boolean(entry?.isRunning && (entry.taskId === taskId || entry.task?.id === taskId)),
    [entry]
  );

  return { entry, elapsed, refresh, isRunningOnTask };
}
