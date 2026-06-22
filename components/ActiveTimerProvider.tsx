"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLiveTimer } from "@/lib/useLiveTimer";
import { useTimeRealtime } from "@/lib/useTimeRealtime";

export interface ActiveTimerEntry {
  id: string;
  startTime: string;
  duration?: number;
  isRunning: boolean;
  isPaused?: boolean;
  description?: string | null;
  taskId?: string;
  task?: { id: string; title: string; status?: string };
  reminderSnoozedUntil?: string | null;
}

type ActiveTimerContextValue = {
  entry: ActiveTimerEntry | null;
  elapsed: number;
  refresh: () => Promise<void>;
  isRunningOnTask: (taskId: string) => boolean;
  isPausedOnTask: (taskId: string) => boolean;
};

const ActiveTimerContext = createContext<ActiveTimerContextValue | null>(null);

export function ActiveTimerProvider({ children }: { children: React.ReactNode }) {
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

  const isActive = Boolean(entry?.isRunning && !entry?.isPaused);
  const accumulated = entry?.duration ?? 0;
  const liveElapsed = useLiveTimer(entry?.startTime, isActive, accumulated);
  const elapsed =
    entry?.isRunning && entry?.isPaused
      ? accumulated
      : entry?.isRunning
        ? liveElapsed
        : 0;

  const isRunningOnTask = useCallback(
    (taskId: string) =>
      Boolean(
        entry?.isRunning &&
          !entry?.isPaused &&
          (entry.taskId === taskId || entry.task?.id === taskId)
      ),
    [entry]
  );

  const isPausedOnTask = useCallback(
    (taskId: string) =>
      Boolean(
        entry?.isRunning &&
          entry?.isPaused &&
          (entry.taskId === taskId || entry.task?.id === taskId)
      ),
    [entry]
  );

  const value = useMemo(
    () => ({
      entry,
      elapsed,
      refresh,
      isRunningOnTask,
      isPausedOnTask,
    }),
    [entry, elapsed, refresh, isRunningOnTask, isPausedOnTask]
  );

  return (
    <ActiveTimerContext.Provider value={value}>{children}</ActiveTimerContext.Provider>
  );
}

export function useActiveTimer() {
  const ctx = useContext(ActiveTimerContext);
  if (!ctx) {
    throw new Error("useActiveTimer must be used within ActiveTimerProvider");
  }
  return ctx;
}
