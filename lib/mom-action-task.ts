import type { Priority, TaskStatus } from "@prisma/client";
import type { MomActionItem, MomActionItemPriority, MomActionItemStatus } from "@/lib/mom-structured";

export function mapMomPriorityToTask(priority: MomActionItemPriority): Priority {
  if (priority === "low") return "LOW";
  if (priority === "high") return "HIGH";
  return "MEDIUM";
}

export function mapMomStatusToTask(status: MomActionItemStatus): TaskStatus {
  if (status === "in_progress") return "IN_PROGRESS";
  if (status === "done") return "COMPLETED";
  return "PENDING";
}

export function mapTaskPriorityToMom(priority: Priority): MomActionItemPriority {
  if (priority === "LOW") return "low";
  if (priority === "HIGH") return "high";
  return "medium";
}

export function mapTaskStatusToMom(status: TaskStatus): MomActionItemStatus {
  if (status === "IN_PROGRESS") return "in_progress";
  if (status === "COMPLETED") return "done";
  return "pending";
}

export type LinkedTaskDetail = {
  id: string;
  title: string;
  priority: Priority;
  status: TaskStatus;
  dueDate: string | null;
  assignees?: { user: { id: string; name: string }; isPrimary: boolean }[];
};

export function linkedTaskToActionItemFields(
  task: LinkedTaskDetail,
  existing: MomActionItem,
  participantNames?: { id: string; name: string }[]
): MomActionItem {
  const primary =
    task.assignees?.find((a) => a.isPrimary)?.user ??
    task.assignees?.[0]?.user;
  let owner = existing.owner;
  if (primary?.name) {
    owner = primary.name;
  } else if (participantNames?.length === 1) {
    owner = participantNames[0]!.name;
  }

  return {
    ...existing,
    task: task.title,
    taskId: task.id,
    createTask: false,
    owner,
    dueDate: task.dueDate ?? "",
    priority: mapTaskPriorityToMom(task.priority),
    status: mapTaskStatusToMom(task.status),
  };
}
