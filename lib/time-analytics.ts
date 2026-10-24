import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveTimeRange, type TimeRangePreset } from "@/lib/time-format";

function buildDateFilter(from: Date | null, to: Date | null): Prisma.TimeEntryWhereInput {
  if (!from && !to) return {};
  const filter: Prisma.TimeEntryWhereInput = { startTime: {} };
  if (from) (filter.startTime as Prisma.DateTimeFilter).gte = from;
  if (to) (filter.startTime as Prisma.DateTimeFilter).lte = to;
  return filter;
}

function sqlNumber(value: bigint | number | null | undefined) {
  if (value == null) return 0;
  return Number(value);
}

type WindowSums = { total: number; today: number; week: number; month: number };

async function sumDurationWindows(extra: Prisma.Sql): Promise<WindowSums> {
  const today = resolveTimeRange("today");
  const week = resolveTimeRange("week");
  const month = resolveTimeRange("month");
  const rows = await prisma.$queryRaw<
    {
      total: bigint | number | null;
      today: bigint | number | null;
      week: bigint | number | null;
      month: bigint | number | null;
    }[]
  >`
    SELECT
      COALESCE(SUM(te.duration), 0) AS total,
      COALESCE(SUM(CASE WHEN te.startTime >= ${today.from} AND te.startTime <= ${today.to} THEN te.duration ELSE 0 END), 0) AS today,
      COALESCE(SUM(CASE WHEN te.startTime >= ${week.from} AND te.startTime <= ${week.to} THEN te.duration ELSE 0 END), 0) AS week,
      COALESCE(SUM(CASE WHEN te.startTime >= ${month.from} AND te.startTime <= ${month.to} THEN te.duration ELSE 0 END), 0) AS month
    FROM TimeEntry te
    INNER JOIN Task t ON t.id = te.taskId
    WHERE te.isRunning = 0 AND ${extra}
  `;
  const row = rows[0];
  return {
    total: sqlNumber(row?.total),
    today: sqlNumber(row?.today),
    week: sqlNumber(row?.week),
    month: sqlNumber(row?.month),
  };
}

type ReportTaskAgg = {
  taskId: string;
  title: string;
  total: number;
  estimatedMinutes: number | null;
  allTimeTotal: number;
};

function aggregateByTag(
  entries: { duration: number; labels: { label: { id: string; name: string } }[] }[]
) {
  const byTagMap = new Map<string, { labelId: string; name: string; total: number }>();
  for (const entry of entries) {
    for (const { label } of entry.labels) {
      const agg = byTagMap.get(label.id) ?? {
        labelId: label.id,
        name: label.name,
        total: 0,
      };
      agg.total += entry.duration;
      byTagMap.set(label.id, agg);
    }
  }

  return [...byTagMap.values()].sort((a, b) => b.total - a.total);
}

function bucketTrend(
  entries: { startTime: Date; duration: number }[],
  granularity: "daily" | "weekly" | "monthly"
) {
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

async function loadTrendEntries(where: Prisma.TimeEntryWhereInput) {
  return prisma.timeEntry.findMany({
    where,
    select: { startTime: true, duration: true },
    orderBy: { startTime: "asc" },
  });
}

async function enrichReportTaskAggs(
  byTaskMap: Map<string, Omit<ReportTaskAgg, "allTimeTotal">>,
  allTimeWhere: Prisma.TimeEntryWhereInput
): Promise<ReportTaskAgg[]> {
  const taskIds = [...byTaskMap.keys()];
  if (taskIds.length === 0) return [];

  const allTimeGroups = await prisma.timeEntry.groupBy({
    by: ["taskId"],
    where: { ...allTimeWhere, taskId: { in: taskIds }, isRunning: false },
    _sum: { duration: true },
  });
  const allTimeByTask = new Map(allTimeGroups.map((g) => [g.taskId, g._sum.duration ?? 0]));

  return [...byTaskMap.values()].map((agg) => ({
    ...agg,
    allTimeTotal: allTimeByTask.get(agg.taskId) ?? 0,
  }));
}

export async function getTaskTrackedTime(taskId: string) {
  const now = new Date();
  const today = resolveTimeRange("today");
  const week = resolveTimeRange("week");
  const rows = await prisma.$queryRaw<
    {
      estimatedMinutes: number | null;
      total: bigint | number | null;
      today: bigint | number | null;
      week: bigint | number | null;
    }[]
  >`
    SELECT
      t.estimatedMinutes AS estimatedMinutes,
      COALESCE(SUM(te.duration), 0) AS total,
      COALESCE(SUM(CASE WHEN te.startTime >= ${today.from} AND te.startTime <= ${today.to} THEN te.duration ELSE 0 END), 0) AS today,
      COALESCE(SUM(CASE WHEN te.startTime >= ${week.from} AND te.startTime <= ${week.to} THEN te.duration ELSE 0 END), 0) AS week
    FROM Task t
    LEFT JOIN TimeEntry te ON te.taskId = t.id AND te.isRunning = 0
    WHERE t.id = ${taskId}
    GROUP BY t.id, t.estimatedMinutes
  `;
  const row = rows[0];

  return {
    total: sqlNumber(row?.total),
    today: sqlNumber(row?.today),
    week: sqlNumber(row?.week),
    asOf: now.toISOString(),
    estimatedMinutes: row?.estimatedMinutes == null ? null : Number(row.estimatedMinutes),
  };
}

export async function getUserTrackedTime(userId: string, workspaceId?: string) {
  const extra = workspaceId
    ? Prisma.sql`te.userId = ${userId} AND t.workspaceId = ${workspaceId}`
    : Prisma.sql`te.userId = ${userId}`;
  const sums = await sumDurationWindows(extra);
  return { total: sums.total, today: sums.today, week: sums.week, month: sums.month };
}

export async function getWorkspaceTrackedTime(workspaceId: string) {
  const sums = await sumDurationWindows(Prisma.sql`t.workspaceId = ${workspaceId}`);
  return { total: sums.total, today: sums.today, week: sums.week, month: sums.month };
}

export function personalTaskFilter(userId: string): Prisma.TimeEntryWhereInput {
  return { task: { userId, workspaceId: null } };
}

export async function getPersonalTrackedTime(userId: string) {
  const sums = await sumDurationWindows(
    Prisma.sql`t.userId = ${userId} AND t.workspaceId IS NULL`
  );
  return { total: sums.total, today: sums.today, week: sums.week, month: sums.month };
}

export async function getPersonalProductivityTrend(
  userId: string,
  granularity: "daily" | "weekly" | "monthly",
  from?: Date | null,
  to?: Date | null
) {
  const range = from && to ? { from, to } : resolveTimeRange("month");
  const entries = await loadTrendEntries({
    ...personalTaskFilter(userId),
    isRunning: false,
    ...buildDateFilter(range.from, range.to),
  });
  return bucketTrend(entries, granularity);
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
      task: { select: { id: true, title: true, estimatedMinutes: true } },
      labels: { include: { label: { select: { id: true, name: true } } } },
    },
  });

  const today = resolveTimeRange("today");
  const week = resolveTimeRange("week");
  const month = resolveTimeRange("month");

  type UserAgg = { userId: string; name: string; today: number; week: number; month: number; total: number };
  type TaskAgg = { taskId: string; title: string; total: number; estimatedMinutes: number | null };

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
      estimatedMinutes: e.task.estimatedMinutes,
    };
    taskAgg.total += e.duration;
    byTaskMap.set(e.taskId, taskAgg);
  }

  const trendRange =
    filters.from && filters.to ? { from: filters.from, to: filters.to } : resolveTimeRange("month");
  const [trendEntries, byTask] = await Promise.all([
    loadTrendEntries({
      ...personalTaskFilter(userId),
      isRunning: false,
      ...buildDateFilter(trendRange.from, trendRange.to),
    }),
    enrichReportTaskAggs(byTaskMap, personalTaskFilter(userId)),
  ]);
  const trendDaily = bucketTrend(trendEntries, "daily");
  const trendWeekly = bucketTrend(trendEntries, "weekly");
  const byTag = aggregateByTag(entries);

  return {
    byUser: [...byUserMap.values()].sort((a, b) => b.total - a.total),
    byTask: byTask.sort((a, b) => b.total - a.total),
    byTag,
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
  const entries = await loadTrendEntries({
    task: { workspaceId },
    isRunning: false,
    ...buildDateFilter(range.from, range.to),
  });
  return bucketTrend(entries, granularity);
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
      task: { select: { id: true, title: true, estimatedMinutes: true } },
      labels: { include: { label: { select: { id: true, name: true } } } },
    },
  });

  const today = resolveTimeRange("today");
  const week = resolveTimeRange("week");
  const month = resolveTimeRange("month");

  type UserAgg = { userId: string; name: string; today: number; week: number; month: number; total: number };
  type TaskAgg = { taskId: string; title: string; total: number; estimatedMinutes: number | null };

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
      estimatedMinutes: e.task.estimatedMinutes,
    };
    taskAgg.total += e.duration;
    byTaskMap.set(e.taskId, taskAgg);
  }

  const trendRange =
    filters.from && filters.to ? { from: filters.from, to: filters.to } : resolveTimeRange("month");
  const [trendEntries, byTask] = await Promise.all([
    loadTrendEntries({
      task: { workspaceId },
      isRunning: false,
      ...buildDateFilter(trendRange.from, trendRange.to),
    }),
    enrichReportTaskAggs(byTaskMap, { task: { workspaceId } }),
  ]);
  const trendDaily = bucketTrend(trendEntries, "daily");
  const trendWeekly = bucketTrend(trendEntries, "weekly");
  const byTag = aggregateByTag(entries);

  return {
    byUser: [...byUserMap.values()].sort((a, b) => b.total - a.total),
    byTask: byTask.sort((a, b) => b.total - a.total),
    byTag,
    trendDaily,
    trendWeekly,
    totalSeconds: entries.reduce((sum, e) => sum + e.duration, 0),
  };
}

export type { TimeRangePreset };
