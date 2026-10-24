import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendEmail, digestEmail } from "@/lib/email";
import { sendPushToUser } from "@/lib/push";
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

  if (dueReminders.length > 0) {
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

    await prisma.reminder.updateMany({
      where: { id: { in: dueReminders.map((reminder) => reminder.id) } },
      data: { sent: true },
    });
  }

  const pendingGroups = await prisma.task.groupBy({
    by: ["userId"],
    where: { status: { not: "COMPLETED" }, archived: false },
    _count: { _all: true },
  });

  if (pendingGroups.length > 0) {
    const userIds = pendingGroups.map((group) => group.userId);
    const pendingByUser = new Map(pendingGroups.map((group) => [group.userId, group._count._all]));
    const [users, overdueRows] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      }),
      prisma.$queryRaw<{ userId: string; title: string }[]>`
        SELECT userId, title FROM (
          SELECT userId, title,
            ROW_NUMBER() OVER (PARTITION BY userId ORDER BY id ASC) AS rn
          FROM Task
          WHERE archived = 0
            AND status <> 'COMPLETED'
            AND dueDate IS NOT NULL
            AND dueDate < ${now}
            AND userId IN (${Prisma.join(userIds)})
        ) ranked
        WHERE rn <= 5
      `,
    ]);

    const overdueTitles = new Map<string, string[]>();
    for (const row of overdueRows) {
      const titles = overdueTitles.get(row.userId) ?? [];
      if (titles.length < 5) titles.push(row.title);
      overdueTitles.set(row.userId, titles);
    }

    for (const user of users) {
      const pending = pendingByUser.get(user.id) ?? 0;
      if (pending <= 0) continue;
      const titles = overdueTitles.get(user.id) ?? [];
      await sendEmail(
        user.email,
        "Your TaskFlow Daily Digest",
        digestEmail(user.name, pending, titles.length, titles)
      );
    }
  }

  return NextResponse.json({ processed: dueReminders.length, archivedCompleted: archivedCount });
}
