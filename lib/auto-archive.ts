import { startOfDay } from "date-fns";
import { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { visibleTaskWhere } from "@/lib/visible-records";

const ARCHIVE_BATCH_SIZE = 100;
const ARCHIVE_MAX_BATCHES = 50;

/** Archive completed tasks from before today (visible on completion day only). Run from the daily reminders cron. */
export async function archiveStaleCompletedTasks() {
  const startOfToday = startOfDay(new Date());
  let archived = 0;

  for (let batch = 0; batch < ARCHIVE_MAX_BATCHES; batch++) {
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
      orderBy: { id: "asc" },
      take: ARCHIVE_BATCH_SIZE,
    });
    if (stale.length === 0) return archived;

    // updateMany cannot filter on the project relation, so archive by the visible ids.
    const result = await prisma.task.updateMany({
      where: { id: { in: stale.map((task) => task.id) }, archived: false },
      data: { archived: true },
    });
    archived += result.count;
    if (stale.length < ARCHIVE_BATCH_SIZE) return archived;
  }

  console.info("[cron:reminders] archive stopped at batch cap", { archived });
  return archived;
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
