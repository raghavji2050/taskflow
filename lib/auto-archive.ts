import { startOfDay } from "date-fns";
import { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { visibleTaskWhere } from "@/lib/visible-records";

/** Archive completed tasks from before today (visible on completion day only). Run from the daily reminders cron. */
export async function archiveStaleCompletedTasks() {
  const startOfToday = startOfDay(new Date());

  const stale = await prisma.task.findMany({
    where: visibleTaskWhere({
      status: TaskStatus.COMPLETED,
      archived: false,
      OR: [
        { completedAt: { lt: startOfToday } },
        {
          completedAt: null,
          updatedAt: { lt: startOfToday },
        },
      ],
    }),
    select: { id: true },
  });
  if (stale.length === 0) return 0;

  // updateMany cannot filter on the project relation, so archive by the visible ids.
  const result = await prisma.task.updateMany({
    where: { id: { in: stale.map((task) => task.id) } },
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
