import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

/** Add users as followers (idempotent). */
export async function followTask(taskId: string, userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  await prisma.taskFollower.createMany({
    data: ids.map((userId) => ({ taskId, userId })),
    skipDuplicates: true,
  });
}

export async function unfollowTask(taskId: string, userId: string) {
  await prisma.taskFollower.deleteMany({ where: { taskId, userId } });
}

export async function listTaskFollowers(taskId: string) {
  const rows = await prisma.taskFollower.findMany({
    where: { taskId },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => r.user);
}

/**
 * Pick who to notify: followers minus the actor and anyone already notified
 * (e.g. @mentioned). For workspace tasks, only current workspace members, so
 * someone removed from the workspace stops hearing about its tasks.
 */
export function pickRecipients(
  followerIds: string[],
  opts: { actorId: string; exclude?: string[]; memberIds?: Set<string> | null }
) {
  const skip = new Set([opts.actorId, ...(opts.exclude ?? [])]);
  return [...new Set(followerIds)].filter(
    (id) => !skip.has(id) && (!opts.memberIds || opts.memberIds.has(id))
  );
}

export async function notifyTaskFollowers(params: {
  taskId: string;
  workspaceId: string | null;
  actorId: string;
  title: string;
  body: string;
  type: string;
  exclude?: string[];
}) {
  const followers = await prisma.taskFollower.findMany({
    where: { taskId: params.taskId },
    select: { userId: true },
  });
  if (!followers.length) return [];
  let memberIds: Set<string> | null = null;
  if (params.workspaceId) {
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: params.workspaceId, userId: { in: followers.map((f) => f.userId) } },
      select: { userId: true },
    });
    memberIds = new Set(members.map((m) => m.userId));
  }
  const recipients = pickRecipients(
    followers.map((f) => f.userId),
    { actorId: params.actorId, exclude: params.exclude, memberIds }
  );
  for (const userId of recipients) {
    await createNotification({ userId, title: params.title, body: params.body, type: params.type });
  }
  return recipients;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "To do",
  IN_PROGRESS: "In progress",
  COMPLETED: "Done",
};

export function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}
