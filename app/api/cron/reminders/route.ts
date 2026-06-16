import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, digestEmail } from "@/lib/email";
import { configureWebPush, sendPushToSubscription } from "@/lib/push";
import { archiveStaleCompletedTasks } from "@/lib/auto-archive";
import { runOverdueAutomations, runDueDateApproachingAutomations } from "@/lib/automations";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const archivedCount = await archiveStaleCompletedTasks();
  await runOverdueAutomations();
  await runDueDateApproachingAutomations();

  const dueReminders = await prisma.reminder.findMany({
    where: { remindAt: { lte: now }, sent: false },
    include: { task: { include: { user: true } } },
  });

  const pushEnabled = configureWebPush();

  for (const reminder of dueReminders) {
    await prisma.notification.create({
      data: {
        userId: reminder.task.userId,
        title: "Task Reminder",
        body: `"${reminder.task.title}" is due soon`,
      },
    });

    const subs = await prisma.pushSubscription.findMany({
      where: { userId: reminder.task.userId },
    });

    if (pushEnabled) {
      for (const sub of subs) {
        try {
          await sendPushToSubscription(sub, {
            userId: reminder.task.userId,
            title: "Task Reminder",
            body: reminder.task.title,
            url: "/dashboard",
          });
        } catch {
          await prisma.pushSubscription.delete({ where: { id: sub.id } });
        }
      }
    }

    await prisma.reminder.update({ where: { id: reminder.id }, data: { sent: true } });
  }

  const users = await prisma.user.findMany();
  for (const user of users) {
    const pending = await prisma.task.count({
      where: { userId: user.id, status: { not: "COMPLETED" }, archived: false },
    });
    const overdueTasks = await prisma.task.findMany({
      where: {
        userId: user.id,
        status: { not: "COMPLETED" },
        archived: false,
        dueDate: { lt: now },
      },
      take: 5,
    });

    if (pending > 0) {
      await sendEmail(
        user.email,
        "Your TaskFlow Daily Digest",
        digestEmail(user.name, pending, overdueTasks.length, overdueTasks.map((t) => t.title))
      );
    }
  }

  return NextResponse.json({ processed: dueReminders.length, archivedCompleted: archivedCount });
}
