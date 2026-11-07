import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { archiveStaleCompletedTasks } from "@/lib/auto-archive";
import { runOverdueAutomations, runDueDateApproachingAutomations } from "@/lib/automations";
import { isCronAuthorized } from "@/lib/cron-auth";
import { visibleTaskWhere } from "@/lib/visible-records";
import { sendDailyDigests } from "@/lib/email-digest";

export const dynamic = "force-dynamic";

const REMINDER_BATCH_SIZE = 100;
const REMINDER_MAX_BATCHES = 20;

export async function GET(request: Request) {
  if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    // Archive yesterday's completed tasks here (daily cron), not on GET /api/tasks.
    const archivedCount = await archiveStaleCompletedTasks();
    await runOverdueAutomations();
    await runDueDateApproachingAutomations();

    let processed = 0;
    let truncated = false;

    for (let batch = 0; batch < REMINDER_MAX_BATCHES; batch++) {
      const dueReminders = await prisma.reminder.findMany({
        where: { remindAt: { lte: now }, sent: false, task: visibleTaskWhere() },
        include: { task: { include: { user: true } } },
        orderBy: { remindAt: "asc" },
        take: REMINDER_BATCH_SIZE,
      });
      if (dueReminders.length === 0) break;

      const createdAt = Date.now();
      await prisma.notification.createMany({
        data: dueReminders.map((reminder, index) => ({
          userId: reminder.task.userId,
          title: "Task Reminder",
          body: `"${reminder.task.title}" is due soon`,
          createdAt: new Date(createdAt + index),
        })),
      });

      await Promise.all(
        dueReminders.map((reminder) =>
          sendPushToUser(reminder.task.userId, {
            title: "Task Reminder",
            body: reminder.task.title,
            url: "/dashboard",
          })
        )
      );

      // sent=false keeps a concurrent tick from marking a row twice.
      await prisma.reminder.updateMany({
        where: { id: { in: dueReminders.map((reminder) => reminder.id) }, sent: false },
        data: { sent: true },
      });

      processed += dueReminders.length;
      if (dueReminders.length < REMINDER_BATCH_SIZE) break;
      if (batch === REMINDER_MAX_BATCHES - 1) truncated = true;
    }

    const digestsSent = await sendDailyDigests(now);

    const result = {
      processed,
      archivedCompleted: archivedCount,
      digestsSent,
      truncated,
    };
    console.info("[cron:reminders]", result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[cron:reminders] failed", error);
    return NextResponse.json({ error: "Maintenance failed" }, { status: 500 });
  }
}
