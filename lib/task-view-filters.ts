import type { Task } from "@/components/TaskCard";

export interface TaskViewFiltersState {
  search: string;
  status: "ALL" | "PENDING" | "IN_PROGRESS" | "COMPLETED";
  assignee: "all" | "me" | "unassigned";
}

export const defaultTaskViewFilters: TaskViewFiltersState = {
  search: "",
  status: "ALL",
  assignee: "all",
};

export function buildTaskQueryParams(
  wsId: string | null,
  filters: TaskViewFiltersState,
  extra?: Record<string, string>
) {
  const params = new URLSearchParams({ limit: "100", archived: "false", ...extra });
  if (wsId) {
    params.set("workspaceId", wsId);
    if (filters.assignee !== "all") params.set("assignee", filters.assignee);
  }
  if (filters.search) params.set("search", filters.search);
  if (filters.status !== "ALL") params.set("status", filters.status);
  return params;
}

export function applyClientTaskFilters(tasks: Task[], filters: TaskViewFiltersState): Task[] {
  let result = tasks;
  if (filters.search.trim()) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description?.toLowerCase().includes(q) ?? false)
    );
  }
  if (filters.status !== "ALL") {
    result = result.filter((t) => t.status === filters.status);
  }
  return result;
}
