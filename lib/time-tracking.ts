import type { Prisma, TimeEntry } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logTaskActivity } from "@/lib/activity";
import { broadcastTimeEvent, broadcastTaskEvent } from "@/lib/realtime";
import {
  computeElapsedSeconds,
  formatDurationShort,
  resolveTimeRange,
  type TimeRangePreset,
} from "@/lib/time-format";
import {
  canEditTimeEntry,
  canStartTimer,
  canViewTimeEntry,
  canViewUserTimeEntries,
} from "@/lib/time-permissions";
import { canAccessTask, canEditTask, getWorkspaceMembership, isWorkspaceMember } from "@/lib/workspace";
import { canManageWorkspace, canViewWorkspace } from "@/lib/workspace-permissions";
import { promoteTaskToInProgress } from "@/lib/time-task-status";

const timeEntryInclude = {
  user: { select: { id: true, name: true, image: true } },
  task: { select: { id: true, title: true, workspaceId: true, status: true } },
} satisfies Prisma.TimeEntryInclude;

export type FormattedTimeEntry = ReturnType<typeof formatTimeEntryForClient>;

export function formatTimeEntryForClient(entry: TimeEntry & {
  user?: { id: string; name: string; image?: string | null };
  task?: { id: string; title: string; workspaceId: string | null; status: string };
}) {
  const elapsed = entry.isRunning
    ? computeElapsedSeconds(entry.startTime)
    : entry.duration;

  return {
    id: entry.id,
    userId: entry.userId,
    taskId: entry.taskId,
    description: entry.description,
    startTime: entry.startTime.toISOString(),
    endTime: entry.endTime?.toISOString() ?? null,
    duration: entry.duration,
    elapsedSeconds: elapsed,
    isRunning: entry.isRunning,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    user: entry.user,
    task: entry.task,
    canEdit: false as boolean,
  };
}

async function emitTimeEvent(
  type: "time:started" | "time:stopped" | "time:updated",
  entry: FormattedTimeEntry,
  actorId: string
) {
  broadcastTimeEvent({
    type,
    workspaceId: entry.task?.workspaceId ?? null,
    taskId: entry.taskId,
    userId: entry.userId,
    actorId,
    entry,
  });
}

async function getUserName(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  return user?.name ?? "User";
}

type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";

interface StopTimerOptions {
  description?: string | null;
  taskStatus?: TaskStatus;
}

async function stopRunningEntryInternal(
  entry: TimeEntry & {
    task?: { id: string; title: string; workspaceId: string | null; status: string };
  },
  actorId: string,
  actorName: string,
  options?: StopTimerOptions
) {
  const endTime = new Date();
  const duration = computeElapsedSeconds(entry.startTime, endTime);
  const updateData: Prisma.TimeEntryUpdateInput = {
    endTime,
    duration,
    isRunning: false,
  };

  if (options && "description" in options) {
    updateData.description = options.description?.trim() || null;
  }

  const updated = await prisma.timeEntry.update({
    where: { id: entry.id },
    data: updateData,
    include: timeEntryInclude,
  });

  if (
    options?.taskStatus &&
    entry.task &&
    options.taskStatus !== entry.task.status &&
    (await canEditTask(actorId, entry.taskId))
  ) {
    const taskRecord = await prisma.task.findUnique({
      where: { id: entry.taskId },
      select: { userId: true, workspaceId: true },
    });
    await prisma.task.update({
      where: { id: entry.taskId },
      data: { status: options.taskStatus },
    });
    await logTaskActivity(
      entry.taskId,
      "updated",
      `Status: ${options.taskStatus} (timer stopped)`
    );
    broadcastTaskEvent({
      type: "task:updated",
      workspaceId: taskRecord?.workspaceId ?? entry.task.workspaceId,
      ownerId: taskRecord?.userId ?? actorId,
      actorId,
      taskId: entry.taskId,
    });
    updated.task = { ...updated.task!, status: options.taskStatus };
  }

  const formatted = formatTimeEntryForClient(updated);
  await logTaskActivity(
    entry.taskId,
    "time_stopped",
    `${actorName} stopped timer (${formatDurationShort(duration)})`
  );
  await emitTimeEvent("time:stopped", formatted, actorId);
  return formatted;
}

export async function getActiveTimer(userId: string) {
  const entry = await prisma.timeEntry.findFirst({
    where: { userId, isRunning: true },
    include: timeEntryInclude,
    orderBy: { startTime: "desc" },
  });
  return entry ? formatTimeEntryForClient(entry) : null;
}

export async function startTimer(
  userId: string,
  taskId: string,
  description?: string | null
) {
  if (!(await canStartTimer(userId, taskId))) {
    throw new Error("Forbidden");
  }

  const task = await canAccessTask(userId, taskId);
  if (!task) throw new Error("Task not found");

  const actorName = await getUserName(userId);

  let statusPromoted = false;
  const entry = await prisma.$transaction(async (tx) => {
    const running = await tx.timeEntry.findFirst({
      where: { userId, isRunning: true },
    });
    if (running) {
      const endTime = new Date();
      const duration = computeElapsedSeconds(running.startTime, endTime);
      await tx.timeEntry.update({
        where: { id: running.id },
        data: { endTime, duration, isRunning: false },
      });
      await logTaskActivity(
        running.taskId,
        "time_stopped",
        `${actorName} stopped timer (${formatDurationShort(duration)})`
      );
    }

    statusPromoted = await promoteTaskToInProgress(tx, {
      id: task.id,
      status: task.status,
      userId: task.userId,
      workspaceId: task.workspaceId,
    });

    return tx.timeEntry.create({
      data: {
        userId,
        taskId,
        description: description?.trim() || null,
        startTime: new Date(),
        isRunning: true,
        duration: 0,
      },
      include: timeEntryInclude,
    });
  });

  const formatted = formatTimeEntryForClient(entry);
  await logTaskActivity(
    taskId,
    "time_started",
    `${actorName} started time tracking`
  );
  if (statusPromoted) {
    await logTaskActivity(taskId, "updated", "Status: IN_PROGRESS (timer started)");
    broadcastTaskEvent({
      type: "task:updated",
      workspaceId: task.workspaceId,
      ownerId: task.userId,
      actorId: userId,
      taskId,
    });
  }
  await emitTimeEvent("time:started", formatted, userId);
  return formatted;
}

export async function stopTimer(
  userId: string,
  timeEntryId?: string,
  options?: StopTimerOptions
) {
  const entry = timeEntryId
    ? await prisma.timeEntry.findFirst({
        where: { id: timeEntryId, userId },
        include: timeEntryInclude,
      })
    : await prisma.timeEntry.findFirst({
        where: { userId, isRunning: true },
        include: timeEntryInclude,
      });

  if (!entry) throw new Error("No active timer found");
  if (!entry.isRunning) throw new Error("Timer is not running");

  const actorName = await getUserName(userId);
  return stopRunningEntryInternal(entry, userId, actorName, options);
}

export async function resumeTimer(
  userId: string,
  taskId: string,
  description?: string | null
) {
  return startTimer(userId, taskId, description);
}

export async function createManualEntry(
  userId: string,
  input: {
    taskId: string;
    date: string;
    durationSeconds: number;
    description?: string | null;
  }
) {
  if (!(await canStartTimer(userId, input.taskId))) {
    throw new Error("Forbidden");
  }

  const task = await canAccessTask(userId, input.taskId);
  if (!task) throw new Error("Task not found");

  const baseDate = new Date(input.date);
  if (Number.isNaN(baseDate.getTime())) throw new Error("Invalid date");

  const endTime = new Date(baseDate);
  const startTime = new Date(endTime.getTime() - input.durationSeconds * 1000);
  const actorName = await getUserName(userId);

  const entry = await prisma.timeEntry.create({
    data: {
      userId,
      taskId: input.taskId,
      description: input.description?.trim() || null,
      startTime,
      endTime,
      duration: input.durationSeconds,
      isRunning: false,
    },
    include: timeEntryInclude,
  });

  const formatted = formatTimeEntryForClient(entry);
  await logTaskActivity(
    input.taskId,
    "time_manual_added",
    `${actorName} logged ${formatDurationShort(input.durationSeconds)}`
  );
  await emitTimeEvent("time:updated", formatted, userId);
  return formatted;
}

export async function updateTimeEntry(
  actorId: string,
  entryId: string,
  input: {
    description?: string | null;
    startTime?: string;
    endTime?: string | null;
    durationSeconds?: number;
  }
) {
  const entry = await prisma.timeEntry.findUnique({
    where: { id: entryId },
    include: timeEntryInclude,
  });
  if (!entry) throw new Error("Time entry not found");

  if (!(await canEditTimeEntry(actorId, entry))) {
    throw new Error("Forbidden");
  }

  const actorName = await getUserName(actorId);
  const data: Prisma.TimeEntryUpdateInput = {};

  if (input.description !== undefined) {
    data.description = input.description?.trim() || null;
  }

  if (entry.isRunning) {
    const hasNonDescriptionFields =
      input.startTime !== undefined ||
      input.endTime !== undefined ||
      input.durationSeconds !== undefined;
    if (hasNonDescriptionFields) {
      throw new Error("Cannot edit duration on a running timer");
    }
    if (input.description === undefined) {
      throw new Error("No updates provided");
    }
    const updated = await prisma.timeEntry.update({
      where: { id: entryId },
      data,
      include: timeEntryInclude,
    });
    const formatted = formatTimeEntryForClient(updated);
    await emitTimeEvent("time:updated", formatted, actorId);
    return formatted;
  }

  let startTime = entry.startTime;
  let endTime = entry.endTime;

  if (input.startTime) {
    const parsed = new Date(input.startTime);
    if (Number.isNaN(parsed.getTime())) throw new Error("Invalid start time");
    startTime = parsed;
    data.startTime = parsed;
  }

  if (input.endTime !== undefined) {
    if (input.endTime === null) {
      endTime = null;
      data.endTime = null;
    } else {
      const parsed = new Date(input.endTime);
      if (Number.isNaN(parsed.getTime())) throw new Error("Invalid end time");
      endTime = parsed;
      data.endTime = parsed;
    }
  }

  if (input.durationSeconds !== undefined) {
    data.duration = input.durationSeconds;
  } else if (endTime) {
    data.duration = computeElapsedSeconds(startTime, endTime);
  }

  const updated = await prisma.timeEntry.update({
    where: { id: entryId },
    data,
    include: timeEntryInclude,
  });

  const formatted = formatTimeEntryForClient(updated);
  await logTaskActivity(
    entry.taskId,
    "time_entry_edited",
    `${actorName} edited time entry (${formatDurationShort(updated.duration)})`
  );
  await emitTimeEvent("time:updated", formatted, actorId);
  return formatted;
}

export async function deleteTimeEntry(actorId: string, entryId: string) {
  const entry = await prisma.timeEntry.findUnique({
    where: { id: entryId },
    include: timeEntryInclude,
  });
  if (!entry) throw new Error("Time entry not found");
  if (entry.isRunning) throw new Error("Stop the timer before deleting");

  if (!(await canEditTimeEntry(actorId, entry))) {
    throw new Error("Forbidden");
  }

  const actorName = await getUserName(actorId);
  await prisma.timeEntry.delete({ where: { id: entryId } });
  await logTaskActivity(
    entry.taskId,
    "time_entry_deleted",
    `${actorName} deleted time entry (${formatDurationShort(entry.duration)})`
  );
  await emitTimeEvent("time:updated", formatTimeEntryForClient(entry), actorId);
}

function buildDateFilter(from: Date | null, to: Date | null): Prisma.TimeEntryWhereInput {
  if (!from && !to) return {};
  const filter: Prisma.TimeEntryWhereInput = {};
  if (from || to) {
    filter.startTime = {};
    if (from) filter.startTime.gte = from;
    if (to) filter.startTime.lte = to;
  }
  return filter;
}

export async function listTaskTimeEntries(
  actorId: string,
  taskId: string,
  query: {
    page?: number;
    limit?: number;
    from?: string | null;
    to?: string | null;
    range?: TimeRangePreset;
    userId?: string | null;
  }
) {
  const task = await canAccessTask(actorId, taskId);
  if (!task) throw new Error("Not found");

  const page = query.page ?? 1;
  const limit = Math.min(query.limit ?? 20, 100);
  const { from, to } = resolveTimeRange(query.range ?? "all", query.from, query.to);

  const where: Prisma.TimeEntryWhereInput = {
    taskId,
    isRunning: false,
    ...buildDateFilter(from, to),
  };
  if (query.userId) where.userId = query.userId;

  const [entries, total] = await Promise.all([
    prisma.timeEntry.findMany({
      where,
      include: timeEntryInclude,
      orderBy: { startTime: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.timeEntry.count({ where }),
  ]);

  const withPermissions = await Promise.all(
    entries.map(async (e) => {
      const formatted = formatTimeEntryForClient(e);
      formatted.canEdit = await canEditTimeEntry(actorId, e);
      return formatted;
    })
  );

  const { getTaskTrackedTime } = await import("@/lib/time-analytics");
  const summary = await getTaskTrackedTime(taskId);

  return {
    entries: withPermissions,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    summary,
    activeTimer: await getActiveTimerForTask(actorId, taskId),
  };
}

async function getActiveTimerForTask(actorId: string, taskId: string) {
  const active = await prisma.timeEntry.findFirst({
    where: { userId: actorId, taskId, isRunning: true },
    include: timeEntryInclude,
  });
  return active ? formatTimeEntryForClient(active) : null;
}

export async function listUserTimeEntries(
  actorId: string,
  targetUserId: string,
  query: {
    page?: number;
    limit?: number;
    from?: string | null;
    to?: string | null;
    range?: TimeRangePreset;
    workspaceId?: string | null;
    taskId?: string | null;
    personal?: boolean;
    includeReport?: boolean;
  }
) {
  if (query.personal) {
    if (actorId !== targetUserId) throw new Error("Forbidden");
  } else if (!(await canViewUserTimeEntries(actorId, targetUserId, query.workspaceId))) {
    throw new Error("Forbidden");
  }

  const page = query.page ?? 1;
  const limit = Math.min(query.limit ?? 20, 100);
  const { from, to } = resolveTimeRange(query.range ?? "all", query.from, query.to);

  const where: Prisma.TimeEntryWhereInput = {
    userId: targetUserId,
    isRunning: false,
    ...buildDateFilter(from, to),
  };

  if (query.personal) {
    where.task = { userId: targetUserId, workspaceId: null };
  } else if (query.workspaceId) {
    where.task = { workspaceId: query.workspaceId };
  } else if (actorId !== targetUserId) {
    throw new Error("Forbidden");
  }

  if (query.taskId) where.taskId = query.taskId;

  const [entries, total] = await Promise.all([
    prisma.timeEntry.findMany({
      where,
      include: timeEntryInclude,
      orderBy: { startTime: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.timeEntry.count({ where }),
  ]);

  const result: Record<string, unknown> = {
    entries: entries.map(formatTimeEntryForClient),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    activeTimer: actorId === targetUserId ? await getActiveTimer(targetUserId) : null,
  };

  if (query.personal) {
    const { getPersonalTrackedTime, getPersonalReport } = await import("@/lib/time-analytics");
    result.summary = await getPersonalTrackedTime(targetUserId);
    if (query.includeReport) {
      result.report = await getPersonalReport(targetUserId, {
        from,
        to,
        taskId: query.taskId ?? undefined,
      });
    }
  } else {
    const { getUserTrackedTime } = await import("@/lib/time-analytics");
    result.summary = await getUserTrackedTime(targetUserId, query.workspaceId ?? undefined);
  }

  return result;
}

export async function listWorkspaceTimeEntries(
  actorId: string,
  workspaceId: string,
  query: {
    page?: number;
    limit?: number;
    from?: string | null;
    to?: string | null;
    range?: TimeRangePreset;
    userId?: string | null;
    taskId?: string | null;
    includeReport?: boolean;
  }
) {
  const membership = await getWorkspaceMembership(actorId, workspaceId);
  if (!canViewWorkspace(membership)) throw new Error("Not found");

  const page = query.page ?? 1;
  const limit = Math.min(query.limit ?? 20, 100);
  const { from, to } = resolveTimeRange(query.range ?? "all", query.from, query.to);

  const where: Prisma.TimeEntryWhereInput = {
    task: { workspaceId },
    isRunning: false,
    ...buildDateFilter(from, to),
  };
  if (query.userId) where.userId = query.userId;
  if (query.taskId) where.taskId = query.taskId;

  const [entries, total] = await Promise.all([
    prisma.timeEntry.findMany({
      where,
      include: timeEntryInclude,
      orderBy: { startTime: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.timeEntry.count({ where }),
  ]);

  const result: Record<string, unknown> = {
    entries: entries.map(formatTimeEntryForClient),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };

  if (query.includeReport) {
    const { getWorkspaceReport } = await import("@/lib/time-analytics");
    result.report = await getWorkspaceReport(workspaceId, {
      from,
      to,
      userId: query.userId ?? undefined,
      taskId: query.taskId ?? undefined,
    });
  }

  const { getWorkspaceTrackedTime } = await import("@/lib/time-analytics");
  result.summary = await getWorkspaceTrackedTime(workspaceId);

  return result;
}

export async function assertWorkspaceMember(userId: string, workspaceId: string) {
  if (!(await isWorkspaceMember(userId, workspaceId))) {
    throw new Error("Not found");
  }
}

export async function getTimeEntryById(entryId: string) {
  return prisma.timeEntry.findUnique({
    where: { id: entryId },
    include: timeEntryInclude,
  });
}

export async function canActorViewEntry(actorId: string, entryId: string) {
  const entry = await getTimeEntryById(entryId);
  if (!entry) return null;
  if (!(await canViewTimeEntry(actorId, entry))) return null;
  return entry;
}
