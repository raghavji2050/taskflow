import type { Task } from "@/components/TaskCard";
import type { TaskInput } from "@/lib/validations";

export function getAssigneePayloadFromTask(task: Task) {
  const assignees = task.assignees ?? [];
  return {
    assigneeIds: assignees.map((a) => a.user.id),
    primaryAssigneeId: assignees.find((a) => a.isPrimary)?.user.id ?? null,
  };
}

export function toTaskInput(task: Task, overrides?: Partial<TaskInput>): TaskInput {
  const { assigneeIds, primaryAssigneeId } = getAssigneePayloadFromTask(task);
  return {
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: task.status,
    dueDate: task.dueDate,
    categoryId: task.categoryId ?? null,
    boardColumnId: task.boardColumnId ?? null,
    workspaceId: task.workspaceId ?? null,
    assigneeIds,
    primaryAssigneeId,
    recurrenceRule: (task.recurrenceRule ?? null) as TaskInput["recurrenceRule"],
    ...overrides,
  };
}
