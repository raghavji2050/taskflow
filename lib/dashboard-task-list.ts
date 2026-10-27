import type { Task } from "@/components/TaskCard";
import type { DashboardStatsData } from "@/components/DashboardStats";
import type { TaskInput } from "@/lib/validations";

export type OptimisticListFilters = {
  search: string;
  status: "ALL" | Task["status"];
  priority: "ALL" | Task["priority"];
  archived: "false" | "true" | "all";
  categoryId: string;
};

export type TaskBoardState = {
  tasks: Task[];
  recentTasks: Task[];
  stats: DashboardStatsData;
};

export type OptimisticTaskChange =
  | { type: "create"; task: Task }
  | { type: "update"; previous: Task; task: Task }
  | { type: "delete"; task: Task };

type CountDelta = {
  total: number;
  completed: number;
  pending: number;
  inProgress: number;
  highPriority: number;
};

export function createOptimisticTaskId(): string {
  const id =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `optimistic-${id}`;
}

export function optimisticTaskFromInput(input: TaskInput, id: string, base?: Task | null): Task {
  const now = new Date().toISOString();
  const categoryId = input.categoryId ?? null;
  const category =
    base && (base.categoryId ?? null) === categoryId ? (base.category ?? null) : null;
  return {
    ...(base ?? {}),
    id,
    title: input.title,
    description: input.description ?? null,
    priority: input.priority,
    status: input.status,
    dueDate: input.dueDate ?? null,
    archived: base?.archived ?? false,
    categoryId,
    category,
    boardColumnId: input.boardColumnId ?? base?.boardColumnId ?? null,
    recurrenceRule: input.recurrenceRule ?? null,
    estimatedMinutes: input.estimatedMinutes ?? null,
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
    workspaceId: input.workspaceId ?? base?.workspaceId ?? null,
    projectId: input.projectId ?? base?.projectId ?? null,
    sectionId: input.sectionId ?? base?.sectionId ?? null,
    position: input.position ?? base?.position,
  };
}

export function taskMatchesListFilters(task: Task, filters: OptimisticListFilters): boolean {
  if (filters.status !== "ALL" && task.status !== filters.status) return false;
  if (filters.priority !== "ALL" && task.priority !== filters.priority) return false;
  if (filters.archived === "true" && !task.archived) return false;
  if (filters.archived === "false" && task.archived) return false;
  if (filters.categoryId && (task.categoryId ?? "") !== filters.categoryId) return false;
  const query = filters.search.trim().toLowerCase();
  if (query) {
    const haystack = `${task.title}\n${task.description ?? ""}`.toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  return true;
}

function contribution(task: Pick<Task, "status" | "priority" | "archived">): CountDelta {
  if (task.archived) {
    return { total: 0, completed: 0, pending: 0, inProgress: 0, highPriority: 0 };
  }
  return {
    total: 1,
    completed: task.status === "COMPLETED" ? 1 : 0,
    pending: task.status === "PENDING" ? 1 : 0,
    inProgress: task.status === "IN_PROGRESS" ? 1 : 0,
    highPriority: task.priority === "HIGH" && task.status !== "COMPLETED" ? 1 : 0,
  };
}

function applyDelta(stats: DashboardStatsData, delta: CountDelta, sign: 1 | -1): DashboardStatsData {
  const total = Math.max(0, stats.total + sign * delta.total);
  const completed = Math.max(0, stats.completed + sign * delta.completed);
  const pending = Math.max(0, stats.pending + sign * delta.pending);
  const inProgress = Math.max(0, (stats.inProgress ?? 0) + sign * delta.inProgress);
  const highPriority = Math.max(0, stats.highPriority + sign * delta.highPriority);
  return {
    ...stats,
    total,
    completed,
    pending,
    inProgress,
    highPriority,
    completionPercentage: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

function placeInList(tasks: Task[], task: Task, filters: OptimisticListFilters): Task[] {
  const rest = tasks.filter((item) => item.id !== task.id);
  if (!taskMatchesListFilters(task, filters)) return rest;
  return [task, ...rest];
}

function replaceInList(tasks: Task[], task: Task, filters: OptimisticListFilters): Task[] {
  const matches = taskMatchesListFilters(task, filters);
  let found = false;
  const next: Task[] = [];
  for (const item of tasks) {
    if (item.id !== task.id) {
      next.push(item);
      continue;
    }
    found = true;
    if (matches) next.push(task);
  }
  if (!found && matches) next.unshift(task);
  return next;
}

function patchRecent(recent: Task[], task: Task, mode: "insert" | "replace"): Task[] {
  if (task.archived) return recent.filter((item) => item.id !== task.id);
  if (mode === "insert") {
    return [task, ...recent.filter((item) => item.id !== task.id)].slice(0, 5);
  }
  if (!recent.some((item) => item.id === task.id)) return recent;
  return recent.map((item) => (item.id === task.id ? task : item));
}

export function applyOptimisticTaskChange(
  state: TaskBoardState,
  change: OptimisticTaskChange,
  filters: OptimisticListFilters
): TaskBoardState {
  if (change.type === "delete") {
    return {
      tasks: state.tasks.filter((task) => task.id !== change.task.id),
      recentTasks: state.recentTasks.filter((task) => task.id !== change.task.id),
      stats: applyDelta(state.stats, contribution(change.task), -1),
    };
  }

  if (change.type === "create") {
    return {
      tasks: placeInList(state.tasks, change.task, filters),
      recentTasks: patchRecent(state.recentTasks, change.task, "insert"),
      stats: applyDelta(state.stats, contribution(change.task), 1),
    };
  }

  return {
    tasks: replaceInList(state.tasks, change.task, filters),
    recentTasks: patchRecent(state.recentTasks, change.task, "replace"),
    stats: applyDelta(
      applyDelta(state.stats, contribution(change.previous), -1),
      contribution(change.task),
      1
    ),
  };
}

/** Swap a provisional row for the saved task without moving an in-place edit to the top. */
export function confirmOptimisticSave(
  state: TaskBoardState,
  temporaryId: string,
  saved: Task,
  filters: OptimisticListFilters
): TaskBoardState {
  const rewrite = (tasks: Task[], mode: "list" | "recent"): Task[] => {
    let replaced = false;
    const next: Task[] = [];
    for (const task of tasks) {
      if (task.id !== temporaryId && task.id !== saved.id) {
        next.push(task);
        continue;
      }
      if (replaced) continue;
      replaced = true;
      const visible = mode === "recent" ? !saved.archived : taskMatchesListFilters(saved, filters);
      if (visible) next.push(saved);
    }
    if (!replaced && temporaryId !== saved.id) {
      const visible = mode === "recent" ? !saved.archived : taskMatchesListFilters(saved, filters);
      if (visible) next.unshift(saved);
    }
    return mode === "recent" ? next.slice(0, 5) : next;
  };

  return {
    tasks: rewrite(state.tasks, "list"),
    recentTasks: rewrite(state.recentTasks, "recent"),
    stats: state.stats,
  };
}
