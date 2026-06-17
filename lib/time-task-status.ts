import type { Prisma, TaskStatus } from "@prisma/client";
import { completedAtForStatusChange } from "@/lib/auto-archive";
import { ensureBoardColumns } from "@/lib/board-columns";

export function shouldPromoteTaskOnTimerStart(status: TaskStatus): boolean {
  return status === "PENDING" || status === "COMPLETED";
}

export function buildTimerStartStatusUpdate(previousStatus: TaskStatus): {
  status: "IN_PROGRESS";
  completedAt?: Date | null;
} | null {
  if (!shouldPromoteTaskOnTimerStart(previousStatus)) return null;
  const completedAt = completedAtForStatusChange("IN_PROGRESS", previousStatus);
  return {
    status: "IN_PROGRESS",
    ...(completedAt !== undefined && { completedAt }),
  };
}

export async function promoteTaskToInProgress(
  tx: Prisma.TransactionClient,
  task: { id: string; status: TaskStatus; userId: string; workspaceId: string | null }
): Promise<boolean> {
  const update = buildTimerStartStatusUpdate(task.status);
  if (!update) return false;

  const columns = await ensureBoardColumns(task.userId, task.workspaceId);
  const inProgressCol = columns.find((c) => c.status === "IN_PROGRESS");

  await tx.task.update({
    where: { id: task.id },
    data: {
      ...update,
      boardColumnId: inProgressCol?.id ?? null,
    },
  });
  return true;
}
