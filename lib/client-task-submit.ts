import type { Task } from "@/components/TaskCard";
import type { TaskInput } from "@/lib/validations";

export type TaskFormSubmitOptions = {
  startTimer?: boolean;
  promoteStatus?: boolean;
};

export async function saveTaskFromForm(
  data: TaskInput,
  editingTaskId?: string | null
): Promise<Task> {
  const url = editingTaskId ? `/api/tasks/${editingTaskId}` : "/api/tasks";
  const response = await fetch(url, {
    method: editingTaskId ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Failed to save task");
  return result.task as Task;
}

export async function startTimerForTask(
  taskId: string,
  options?: { promoteStatus?: boolean }
): Promise<void> {
  const res = await fetch("/api/time/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskId,
      promoteStatus: options?.promoteStatus !== false,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Could not start timer");
  }
}

export async function saveTaskWithOptionalTimer(
  data: TaskInput,
  editingTaskId: string | null | undefined,
  options?: TaskFormSubmitOptions
): Promise<Task> {
  const task = await saveTaskFromForm(data, editingTaskId);
  if (!editingTaskId && options?.startTimer && task.id) {
    await startTimerForTask(task.id, { promoteStatus: options.promoteStatus });
  }
  return task;
}
