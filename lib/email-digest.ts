import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { digestEmail, sendEmail } from "@/lib/email";
import { attachOpenBlockerCounts, isReadyToStart } from "@/lib/task-dependencies";
import { visibleTaskSql, visibleTaskWhere } from "@/lib/visible-records";

export type DigestUser = {
  id: string;
  name: string;
  email: string;
  emailDigestEnabled: boolean;
};

/**
 * Send daily digests for users who have pending owned tasks and have not opted out.
 * Returns how many emails were attempted.
 */
export async function sendDailyDigests(now = new Date()): Promise<number> {
  const pendingGroups = await prisma.task.groupBy({
    by: ["userId"],
    where: visibleTaskWhere({ status: { not: "COMPLETED" }, archived: false }),
    _count: { _all: true },
  });
  if (pendingGroups.length === 0) return 0;

  const userIds = pendingGroups.map((group) => group.userId);
  const pendingByUser = new Map(pendingGroups.map((group) => [group.userId, group._count._all]));

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [users, overdueCounts, overdueRows, mentionCounts, assignedRows] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds }, emailDigestEnabled: true },
      select: { id: true, name: true, email: true, emailDigestEnabled: true },
    }),
    prisma.task.groupBy({
      by: ["userId"],
      where: visibleTaskWhere({
        status: { not: "COMPLETED" },
        archived: false,
        dueDate: { lt: now },
        userId: { in: userIds },
      }),
      _count: { _all: true },
    }),
    prisma.$queryRaw<{ userId: string; title: string }[]>`
      SELECT userId, title FROM (
        SELECT userId, title,
          ROW_NUMBER() OVER (PARTITION BY userId ORDER BY dueDate ASC, id ASC) AS rn
        FROM Task
        WHERE archived = 0
          AND status <> 'COMPLETED'
          AND dueDate IS NOT NULL
          AND dueDate < ${now}
          AND userId IN (${Prisma.join(userIds)})
          AND ${visibleTaskSql("Task")}
      ) ranked
      WHERE rn <= 5
    `,
    prisma.notification.groupBy({
      by: ["userId"],
      where: {
        userId: { in: userIds },
        type: "mention",
        read: false,
        archivedAt: null,
        createdAt: { gte: yesterday },
      },
      _count: { _all: true },
    }),
    prisma.task.findMany({
      where: visibleTaskWhere({
        archived: false,
        status: { not: "COMPLETED" },
        assignees: { some: { userId: { in: userIds } } },
      }),
      select: {
        id: true,
        status: true,
        title: true,
        assignees: { select: { userId: true } },
      },
      take: 5000,
    }),
  ]);

  const overdueByUser = new Map(overdueCounts.map((row) => [row.userId, row._count._all]));
  const mentionsByUser = new Map(mentionCounts.map((row) => [row.userId, row._count._all]));

  const overdueTitles = new Map<string, string[]>();
  for (const row of overdueRows) {
    const titles = overdueTitles.get(row.userId) ?? [];
    if (titles.length < 5) titles.push(row.title);
    overdueTitles.set(row.userId, titles);
  }

  const withBlockers = await attachOpenBlockerCounts(assignedRows);
  const readyByUser = new Map<string, { count: number; titles: string[] }>();
  for (const task of withBlockers) {
    if (!isReadyToStart(task)) continue;
    for (const a of task.assignees) {
      if (!userIds.includes(a.userId)) continue;
      const cur = readyByUser.get(a.userId) ?? { count: 0, titles: [] };
      cur.count += 1;
      if (cur.titles.length < 5) cur.titles.push(task.title);
      readyByUser.set(a.userId, cur);
    }
  }

  let digestsSent = 0;
  for (const user of users) {
    const pending = pendingByUser.get(user.id) ?? 0;
    if (pending <= 0) continue;
    const overdue = overdueByUser.get(user.id) ?? 0;
    const ready = readyByUser.get(user.id);
    const mentions = mentionsByUser.get(user.id) ?? 0;
    const titles = [
      ...(overdueTitles.get(user.id) ?? []),
      ...((ready?.titles ?? []).filter((t) => !(overdueTitles.get(user.id) ?? []).includes(t))),
    ].slice(0, 5);

    await sendEmail(
      user.email,
      "Your TaskFlow Daily Digest",
      digestEmail({
        name: user.name,
        pending,
        overdue,
        ready: ready?.count ?? 0,
        mentions,
        taskTitles: titles,
      })
    );
    digestsSent += 1;
  }

  return digestsSent;
}

/** Pure helper for tests: which users should receive a digest email. */
export function filterDigestRecipients<T extends { emailDigestEnabled: boolean }>(users: T[]): T[] {
  return users.filter((u) => u.emailDigestEnabled !== false);
}
