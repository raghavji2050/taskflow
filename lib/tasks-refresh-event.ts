"use client";

import { useEffect } from "react";

export const TASKS_REFRESH_EVENT = "taskflow:tasks-refresh";

export function dispatchTasksRefresh() {
  window.dispatchEvent(new CustomEvent(TASKS_REFRESH_EVENT));
}

export function useTasksRefreshListener(onRefresh: () => void) {
  useEffect(() => {
    const handler = () => onRefresh();
    window.addEventListener(TASKS_REFRESH_EVENT, handler);
    return () => window.removeEventListener(TASKS_REFRESH_EVENT, handler);
  }, [onRefresh]);
}
