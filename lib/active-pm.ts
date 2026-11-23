import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendEmail, weeklySummaryEmail } from "@/lib/email";
import { visibleTaskWhere } from "@/lib/visible-records";
import { effectivePlan, type PlanId } from "@/lib/billing-plans";

/**
 * "Active PM": TaskFlow nudges people to do the work instead of only tracking it.
 * Runs from the daily /api/cron/reminders job (08:00 UTC) — no extra cron entries.
 */

export const STALE_DAYS = 3;
export const DUE_SOON_HOURS = 48;
const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 2000;

const PRIORITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export type RankableTask = {
  id: string;
  title: string;
  dueDate?: Date | string | null;
  priority?: string | null;
};

export type TopTask = { id: string; title: string; reason: string };

function time(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/** 0 = overdue, 1 = due soon, 2 = everything else. */
export function taskBucket(task: RankableTask, now: Date): 0 | 1 | 2 {
  const due = time(task.dueDate);
  if (due === null) return 2;
  if (due < now.getTime()) return 0;
  if (due <= now.getTime() + DUE_SOON_HOURS * 60 * 60 * 1000) return 1;
  return 2;
}

/** Pick a user's top N open tasks: overdue first, then due soon, then by priority. */
export function pickTopTasks<T extends RankableTask>(tasks: T[], now: Date, limit = 3): TopTask[] {
  const seen = new Set<string>();
  const unique = tasks.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
  const prio = (t: RankableTask) => PRIORITY_RANK[t.priority ?? "MEDIUM"] ?? 1;
  const due = (t: RankableTask) => time(t.dueDate) ?? Number.POSITIVE_INFINITY;
  return unique
    .map((task) => ({ task, bucket: taskBucket(task, now) }))
    .sort((a, b) => {
      if (a.bucket !== b.bucket) return a.bucket - b.bucket;
      if (a.bucket === 2) {
        return prio(a.task) - prio(b.task) || due(a.task) - due(b.task) || a.task.id.localeCompare(b.task.id);
      }
      return due(a.task) - due(b.task) || prio(a.task) - prio(b.task) || a.task.id.localeCompare(b.task.id);
    })
    .slice(0, limit)
    .map(({ task, bucket }) => ({
      id: task.id,
      title: task.title,
      reason: bucket === 0 ? "overdue" : bucket === 1 ? "due soon" : `${(task.priority ?? "MEDIUM").toLowerCase()} priority`,
    }));
}

/** A task is stale when it has not been updated for STALE_DAYS days. */
export function isStale(updatedAt: Date | string | null | undefined, now: Date, days = STALE_DAYS): boolean {
  const t = time(updatedAt);
  return t !== null && t <= now.getTime() - days * DAY_MS;
}

/** Window of updatedAt values that *just* crossed the stale threshold since the last daily run. */
export function staleCrossingWindow(now: Date, days = STALE_DAYS) {
  return { gte: new Date(now.getTime() - (days + 1) * DAY_MS), lt: new Date(now.getTime() - days * DAY_MS) };
}

/** Window of dueDate values that became overdue since the last daily run. */
export function overdueCrossingWindow(now: Date) {
  return { gte: new Date(now.getTime() - DAY_MS), lt: now };
}

/** Weekly summary goes out from the daily cron on Mondays (UTC; 08:00 UTC = 1:30 PM IST). */
export function isWeeklySummaryDay(now: Date): boolean {
  return now.getUTCDay() === 1;
}

export function isPaidWorkspace(plan: string, planStatus: string | null | undefined): boolean {
  return effectivePlan(plan as PlanId, planStatus) !== "FREE";
}

type NudgeTask = {
  id: string;
  title: string;
  userId: string;
  assignees: { userId: string }[];
};

async function nudgeEnabledUserIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, activeNudgesEnabled: true },
    select: { id: true },
  });
  return new Set(users.map((u) => u.id));
}

/** In-app notification for each owner/assignee when a task becomes overdue. */
export async function sendOverdueAlerts(now: Date): Promise<number> {
  const tasks: NudgeTask[] = await prisma.task.findMany({
    where: visibleTaskWhere({
      archived: false,
      status: { not: "COMPLETED" },
      dueDate: overdueCrossingWindow(now),
    }),
    select: { id: true, title: true, userId: true, assignees: { select: { userId: true } } },
    take: BATCH_LIMIT,
  });
  const recipients = tasks.map((t) => ({
    task: t,
    userIds: [...new Set([t.userId, ...t.assignees.map((a) => a.userId)])],
  }));
  const enabled = await nudgeEnabledUserIds([...new Set(recipients.flatMap((r) => r.userIds))]);
  const data = recipients.flatMap(({ task, userIds }) =>
    userIds
      .filter((id) => enabled.has(id))
      .map((userId) => ({
        userId,
        type: "task_overdue",
        title: "Task overdue",
        body: `"${task.title}" is now overdue`,
      }))
  );
  if (data.length > 0) await prisma.notification.createMany({ data });
  return data.length;
}

/** In-app nudge for assignees once a task crosses STALE_DAYS without an update. */
export async function sendStaleNudges(now: Date): Promise<number> {
  const tasks: NudgeTask[] = await prisma.task.findMany({
    where: visibleTaskWhere({
      archived: false,
      status: { not: "COMPLETED" },
      updatedAt: staleCrossingWindow(now),
      assignees: { some: {} },
    }),
    select: { id: true, title: true, userId: true, assignees: { select: { userId: true } } },
    take: BATCH_LIMIT,
  });
  const enabled = await nudgeEnabledUserIds([
    ...new Set(tasks.flatMap((t) => t.assignees.map((a) => a.userId))),
  ]);
  const data = tasks.flatMap((task) =>
    [...new Set(task.assignees.map((a) => a.userId))]
      .filter((id) => enabled.has(id))
      .map((userId) => ({
        userId,
        type: "task_stale",
        title: "Task needs an update",
        body: `"${task.title}" has had no update for ${STALE_DAYS} days`,
      }))
  );
  if (data.length > 0) await prisma.notification.createMany({ data });
  return data.length;
}

/** Monday summary (done / overdue / stale) for members of paid workspaces. */
export async function sendWeeklySummaries(now: Date): Promise<number> {
  if (!isWeeklySummaryDay(now)) return 0;
  const workspaces = await prisma.workspace.findMany({
    where: { plan: { not: "FREE" }, archivedAt: null },
    select: {
      id: true,
      name: true,
      plan: true,
      planStatus: true,
      members: {
        where: { user: { activeNudgesEnabled: true } },
        select: { user: { select: { id: true, name: true, email: true } } },
      },
    },
    take: 500,
  });

  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const staleBefore = new Date(now.getTime() - STALE_DAYS * DAY_MS);
  let sent = 0;
  for (const ws of workspaces) {
    if (!isPaidWorkspace(ws.plan, ws.planStatus) || ws.members.length === 0) continue;
    const open = { workspaceId: ws.id, archived: false, status: { not: "COMPLETED" as const } };
    const [done, overdue, stale] = await Promise.all([
      prisma.task.count({
        where: visibleTaskWhere({ workspaceId: ws.id, status: "COMPLETED", completedAt: { gte: weekAgo } }),
      }),
      prisma.task.count({ where: visibleTaskWhere({ ...open, dueDate: { lt: now } }) }),
      prisma.task.count({ where: visibleTaskWhere({ ...open, updatedAt: { lte: staleBefore } }) }),
    ]);
    for (const { user } of ws.members) {
      try {
        await sendEmail(
          user.email,
          `Your TaskFlow weekly summary: ${ws.name}`,
          weeklySummaryEmail({ name: user.name, workspaceName: ws.name, done, overdue, stale })
        );
        sent += 1;
      } catch (error) {
        console.warn("[active-pm] weekly summary send failed", error);
      }
    }
  }
  return sent;
}

export type ActivePmResult = { overdueAlerts: number; staleNudges: number; weeklySummaries: number };

/** Run every Active PM step. Each step is isolated so one failure doesn't stop the others. */
export async function runActivePm(now = new Date()): Promise<ActivePmResult> {
  const safe = async (name: string, fn: () => Promise<number>) => {
    try {
      return await fn();
    } catch (error) {
      console.error(`[active-pm] ${name} failed`, error);
      return 0;
    }
  };
  return {
    overdueAlerts: await safe("overdue", () => sendOverdueAlerts(now)),
    staleNudges: await safe("stale", () => sendStaleNudges(now)),
    weeklySummaries: await safe("weekly", () => sendWeeklySummaries(now)),
  };
}

// ---- User setting: turn nudges off ----

export const nudgePrefsSchema = z.object({ activeNudgesEnabled: z.boolean() });
export type NudgePrefs = z.infer<typeof nudgePrefsSchema>;

export async function getNudgePrefs(userId: string): Promise<NudgePrefs> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { activeNudgesEnabled: true } });
  return { activeNudgesEnabled: user?.activeNudgesEnabled ?? true };
}

export async function updateNudgePrefs(userId: string, input: unknown): Promise<NudgePrefs> {
  const data = nudgePrefsSchema.parse(input);
  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { activeNudgesEnabled: true },
  });
  return { activeNudgesEnabled: user.activeNudgesEnabled };
}
