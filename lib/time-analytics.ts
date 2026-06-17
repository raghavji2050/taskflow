import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveTimeRange, type TimeRangePreset } from "@/lib/time-format";

function buildDateFilter(from: Date | null, to: Date | null): Prisma.TimeEntryWhereInput {
  if (!from && !to) return {};
  const filter: Prisma.TimeEntryWhereInput = { startTime: {} };
  if (from) (filter.startTime as Prisma.DateTimeFilter).gte = from;
  if (to) (filter.startTime as Prisma.DateTimeFilter).lte = to;
  return filter;
}

async function sumDuration(where: Prisma.TimeEntryWhereInput): Promise<number> {
  const result = await prisma.timeEntry.aggregate({
    where: { ...where, isRunning: false },
    _sum: { duration: true },
  });
  return result._sum.duration ?? 0;
}

export async function getTaskTrackedTime(taskId: string) {
  const now = new Date();
  const today = resolveTimeRange("today");
  const week = resolveTimeRange("week");

  const [total, todaySeconds, weekSeconds] = await Promise.all([
    sumDuration({ taskId }),
    sumDuration({ taskId, ...buildDateFilter(today.from, today.to) }),
    sumDuration({ taskId, ...buildDateFilter(week.from, week.to) }),
  ]);

  return { total, today: todaySeconds, week: weekSeconds, asOf: now.toISOString() };
}

export async function getUserTrackedTime(userId: string, workspaceId?: string) {
  const taskFilter: Prisma.TimeEntryWhereInput = workspaceId
    ? { task: { workspaceId } }
    : {};

  const today = resolveTimeRange("today");
  const week = resolveTimeRange("week");
  const month = resolveTimeRange("month");

  const base = { userId, ...taskFilter };

  const [total, todaySeconds, weekSeconds, monthSeconds] = await Promise.all([
    sumDuration(base),
    sumDuration({ ...base, ...buildDateFilter(today.from, today.to) }),
    sumDuration({ ...base, ...buildDateFilter(week.from, week.to) }),
    sumDuration({ ...base, ...buildDateFilter(month.from, month.to) }),
  ]);

  return { total, today: todaySeconds, week: weekSeconds, month: monthSeconds };
}

export async function getWorkspaceTrackedTime(workspaceId: string) {
  const today = resolveTimeRange("today");
  const week = resolveTimeRange("week");
  const month = resolveTimeRange("month");
  const base = { task: { workspaceId } };

  const [total, todaySeconds, weekSeconds, monthSeconds] = await Promise.all([
    sumDuration(base),
    sumDuration({ ...base, ...buildDateFilter(today.from, today.to) }),
    sumDuration({ ...base, ...buildDateFilter(week.from, week.to) }),
    sumDuration({ ...base, ...buildDateFilter(month.from, month.to) }),
  ]);

  return { total, today: todaySeconds, week: weekSeconds, month: monthSeconds };
}

export function personalTaskFilter(userId: string): Prisma.TimeEntryWhereInput {
  return { task: { userId, workspaceId: null } };
}

export async function getPersonalTrackedTime(userId: string) {
  const today = resolveTimeRange("today");
  const week = resolveTimeRange("week");
  const month = resolveTimeRange("month");
  const base = personalTaskFilter(userId);

  const [total, todaySeconds, weekSeconds, monthSeconds] = await Promise.all([
    sumDuration(base),
    sumDuration({ ...base, ...buildDateFilter(today.from, today.to) }),
    sumDuration({ ...base, ...buildDateFilter(week.from, week.to) }),
    sumDuration({ ...base, ...buildDateFilter(month.from, month.to) }),
  ]);

  return { total, today: todaySeconds, week: weekSeconds, month: monthSeconds };
}

export async function getPersonalProductivityTrend(
  userId: string,
  granularity: "daily" | "weekly" | "monthly",
  from?: Date | null,
  to?: Date | null
) {
  const range = from && to ? { from, to } : resolveTimeRange("month");
  const entries = await prisma.timeEntry.findMany({
    where: {
      ...personalTaskFilter(userId),
      isRunning: false,
      ...buildDateFilter(range.from, range.to),
    },
    select: { startTime: true, duration: true },
    orderBy: { startTime: "asc" },
  });

  const buckets = new Map<string, number>();

  for (const entry of entries) {
    const d = entry.startTime;
    let key: string;
    if (granularity === "daily") {
      key = d.toISOString().slice(0, 10);
    } else if (granularity === "weekly") {
      const weekStart = new Date(d);
      const day = weekStart.getDay();
      const diff = day === 0 ? 6 : day - 1;
      weekStart.setDate(weekStart.getDate() - diff);
      key = weekStart.toISOString().slice(0, 10);
    } else {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    buckets.set(key, (buckets.get(key) ?? 0) + entry.duration);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, seconds]) => ({ date, seconds, hours: Math.round((seconds / 3600) * 100) / 100 }));
}

export async function getPersonalReport(
  userId: string,
  filters: {
    from?: Date | null;
    to?: Date | null;
    taskId?: string;
  }
) {
  const where: Prisma.TimeEntryWhereInput = {
    ...personalTaskFilter(userId),
    isRunning: false,
    ...buildDateFilter(filters.from ?? null, filters.to ?? null),
  };
  if (filters.taskId) where.taskId = filters.taskId;

  const entries = await prisma.timeEntry.findMany({
    where,
    select: {
      userId: true,
      taskId: true,
      duration: true,
      startTime: true,
      user: { select: { id: true, name: true } },
      task: { select: { id: true, title: true } },
    },
  });

  const today = resolveTimeRange("today");
  const week = resolveTimeRange("week");
  const month = resolveTimeRange("month");

  type UserAgg = { userId: string; name: string; today: number; week: number; month: number; total: number };
  type TaskAgg = { taskId: string; title: string; total: number };

  const byUserMap = new Map<string, UserAgg>();
  const byTaskMap = new Map<string, TaskAgg>();

  for (const e of entries) {
    const userAgg = byUserMap.get(e.userId) ?? {
      userId: e.userId,
      name: e.user.name,
      today: 0,
      week: 0,
      month: 0,
      total: 0,
    };
    userAgg.total += e.duration;
    if (today.from && e.startTime >= today.from && (!today.to || e.startTime <= today.to)) {
      userAgg.today += e.duration;
    }
    if (week.from && e.startTime >= week.from && (!week.to || e.startTime <= week.to)) {
      userAgg.week += e.duration;
    }
    if (month.from && e.startTime >= month.from && (!month.to || e.startTime <= month.to)) {
      userAgg.month += e.duration;
    }
    byUserMap.set(e.userId, userAgg);

    const taskAgg = byTaskMap.get(e.taskId) ?? {
      taskId: e.taskId,
      title: e.task.title,
      total: 0,
    };
    taskAgg.total += e.duration;
    byTaskMap.set(e.taskId, taskAgg);
  }

  const [trendDaily, trendWeekly] = await Promise.all([
    getPersonalProductivityTrend(userId, "daily", filters.from, filters.to),
    getPersonalProductivityTrend(userId, "weekly", filters.from, filters.to),
  ]);

  return {
    byUser: [...byUserMap.values()].sort((a, b) => b.total - a.total),
    byTask: [...byTaskMap.values()].sort((a, b) => b.total - a.total),
    trendDaily,
    trendWeekly,
    totalSeconds: entries.reduce((sum, e) => sum + e.duration, 0),
  };
}

export async function getProductivityTrend(
  workspaceId: string,
  granularity: "daily" | "weekly" | "monthly",
  from?: Date | null,
  to?: Date | null
) {
  const range = from && to ? { from, to } : resolveTimeRange("month");
  const entries = await prisma.timeEntry.findMany({
    where: {
      task: { workspaceId },
      isRunning: false,
      ...buildDateFilter(range.from, range.to),
    },
    select: { startTime: true, duration: true },
    orderBy: { startTime: "asc" },
  });

  const buckets = new Map<string, number>();

  for (const entry of entries) {
    const d = entry.startTime;
    let key: string;
    if (granularity === "daily") {
      key = d.toISOString().slice(0, 10);
    } else if (granularity === "weekly") {
      const weekStart = new Date(d);
      const day = weekStart.getDay();
      const diff = day === 0 ? 6 : day - 1;
      weekStart.setDate(weekStart.getDate() - diff);
      key = weekStart.toISOString().slice(0, 10);
    } else {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    buckets.set(key, (buckets.get(key) ?? 0) + entry.duration);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, seconds]) => ({ date, seconds, hours: Math.round((seconds / 3600) * 100) / 100 }));
}

export async function getWorkspaceReport(
  workspaceId: string,
  filters: {
    from?: Date | null;
    to?: Date | null;
    userId?: string;
    taskId?: string;
  }
) {
  const where: Prisma.TimeEntryWhereInput = {
    task: { workspaceId },
    isRunning: false,
    ...buildDateFilter(filters.from ?? null, filters.to ?? null),
  };
  if (filters.userId) where.userId = filters.userId;
  if (filters.taskId) where.taskId = filters.taskId;

  const entries = await prisma.timeEntry.findMany({
    where,
    select: {
      userId: true,
      taskId: true,
      duration: true,
      startTime: true,
      user: { select: { id: true, name: true } },
      task: { select: { id: true, title: true } },
    },
  });

  const today = resolveTimeRange("today");
  const week = resolveTimeRange("week");
  const month = resolveTimeRange("month");

  type UserAgg = { userId: string; name: string; today: number; week: number; month: number; total: number };
  type TaskAgg = { taskId: string; title: string; total: number };

  const byUserMap = new Map<string, UserAgg>();
  const byTaskMap = new Map<string, TaskAgg>();

  for (const e of entries) {
    const userAgg = byUserMap.get(e.userId) ?? {
      userId: e.userId,
      name: e.user.name,
      today: 0,
      week: 0,
      month: 0,
      total: 0,
    };
    userAgg.total += e.duration;
    if (today.from && e.startTime >= today.from && (!today.to || e.startTime <= today.to)) {
      userAgg.today += e.duration;
    }
    if (week.from && e.startTime >= week.from && (!week.to || e.startTime <= week.to)) {
      userAgg.week += e.duration;
    }
    if (month.from && e.startTime >= month.from && (!month.to || e.startTime <= month.to)) {
      userAgg.month += e.duration;
    }
    byUserMap.set(e.userId, userAgg);

    const taskAgg = byTaskMap.get(e.taskId) ?? {
      taskId: e.taskId,
      title: e.task.title,
      total: 0,
    };
    taskAgg.total += e.duration;
    byTaskMap.set(e.taskId, taskAgg);
  }

  const [trendDaily, trendWeekly] = await Promise.all([
    getProductivityTrend(workspaceId, "daily", filters.from, filters.to),
    getProductivityTrend(workspaceId, "weekly", filters.from, filters.to),
  ]);

  return {
    byUser: [...byUserMap.values()].sort((a, b) => b.total - a.total),
    byTask: [...byTaskMap.values()].sort((a, b) => b.total - a.total),
    trendDaily,
    trendWeekly,
    totalSeconds: entries.reduce((sum, e) => sum + e.duration, 0),
  };
}

export type { TimeRangePreset };
