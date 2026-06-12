import { startOfDay } from "date-fns";
import { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Archive completed tasks from before today (visible on completion day only). */
export async function archiveStaleCompletedTasks() {
  const startOfToday = startOfDay(new Date());

  const result = await prisma.task.updateMany({
    where: {
      status: TaskStatus.COMPLETED,
      archived: false,
      OR: [
        { completedAt: { lt: startOfToday } },
        {
          completedAt: null,
          updatedAt: { lt: startOfToday },
        },
      ],
    },
    data: { archived: true },
  });

  return result.count;
}

export function completedAtForStatusChange(
  newStatus: TaskStatus,
  previousStatus: TaskStatus
): Date | null | undefined {
  if (newStatus === TaskStatus.COMPLETED && previousStatus !== TaskStatus.COMPLETED) {
    return new Date();
  }
  if (newStatus !== TaskStatus.COMPLETED && previousStatus === TaskStatus.COMPLETED) {
    return null;
  }
  return undefined;
}
