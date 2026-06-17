"use client";

import { useEffect } from "react";

export const OPEN_TASK_EVENT = "taskflow:open-task";

export function dispatchOpenTask(taskId: string) {
  window.dispatchEvent(
    new CustomEvent(OPEN_TASK_EVENT, { detail: { taskId } })
  );
}

export function useOpenTaskListener(onOpen: (taskId: string) => void) {
  useEffect(() => {
    const handler = (event: Event) => {
      const taskId = (event as CustomEvent<{ taskId: string }>).detail?.taskId;
      if (taskId) onOpen(taskId);
    };
    window.addEventListener(OPEN_TASK_EVENT, handler);
    return () => window.removeEventListener(OPEN_TASK_EVENT, handler);
  }, [onOpen]);
}
