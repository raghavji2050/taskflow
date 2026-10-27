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
import { getEntryElapsedSeconds, validateSplitSegments } from "@/lib/time-reminder";
import {
  canEditFlagsForTaskEntries,
  canEditTimeEntry,
  canStartTimer,
  canViewTimeEntry,
  canViewUserTimeEntries,
} from "@/lib/time-permissions";
import { canAccessTask, canEditTask, getWorkspaceMembership, isWorkspaceMember } from "@/lib/workspace";
import { visibleTaskWhere } from "@/lib/visible-records";
import { canManageWorkspace, canViewWorkspace } from "@/lib/workspace-permissions";
import { promoteTaskToInProgress } from "@/lib/time-task-status";

const timeEntryInclude = {
  user: { select: { id: true, name: true, image: true } },
  task: { select: { id: true, title: true, workspaceId: true, status: true } },
  labels: { include: { label: { select: { id: true, name: true, color: true } } } },
} satisfies Prisma.TimeEntryInclude;

type TimeEntryWithRelations = TimeEntry & {
  user?: { id: string; name: string; image?: string | null };
  task?: { id: string; title: string; workspaceId: string | null; status: string };
  labels?: { label: { id: string; name: string; color: string | null } }[];
};

function mapEntryLabels(entry: TimeEntryWithRelations) {
  return (entry.labels ?? []).map((t) => t.label);
}

export function formatTimeEntryForClient(entry: TimeEntryWithRelations) {
  const elapsed = entry.isRunning
    ? getEntryElapsedSeconds(entry)
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
    isPaused: entry.isPaused,
    lastReminderAt: entry.lastReminderAt?.toISOString() ?? null,
    reminderSnoozedUntil: entry.reminderSnoozedUntil?.toISOString() ?? null,
    labels: mapEntryLabels(entry),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    user: entry.user,
    task: entry.task,
    canEdit: false as boolean,
  };
}

export type FormattedTimeEntry = ReturnType<typeof formatTimeEntryForClient>;

async function syncEntryLabels(entryId: string, labelIds: string[], userId: string) {
  if (labelIds.length === 0) {
    await prisma.timeEntryTag.deleteMany({ where: { timeEntryId: entryId } });
    return;
  }
  const valid = await prisma.timeEntryLabel.findMany({
    where: { id: { in: labelIds }, userId },
    select: { id: true },
  });
  const validIds = valid.map((l) => l.id);
  await prisma.timeEntryTag.deleteMany({
    where: { timeEntryId: entryId, labelId: { notIn: validIds } },
  });
  if (validIds.length > 0) {
    await prisma.timeEntryTag.createMany({
      data: validIds.map((labelId) => ({ timeEntryId: entryId, labelId })),
      skipDuplicates: true,
    });
  }
}

async function emitTimeEvent(
  type: "time:started" | "time:stopped" | "time:updated" | "time:paused" | "time:resumed",
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
  labelIds?: string[];
}

function finalizeDuration(entry: Pick<TimeEntry, "duration" | "startTime" | "isPaused">, endTime = new Date()) {
  if (entry.isPaused) return entry.duration;
  const segment = computeElapsedSeconds(entry.startTime, endTime);
  return entry.duration + segment;
}

async function stopRunningEntryInternal(
  entry: TimeEntryWithRelations,
  actorId: string,
  actorName: string,
  options?: StopTimerOptions
) {
  const endTime = new Date();
  const duration = finalizeDuration(entry, endTime);
  const updateData: Prisma.TimeEntryUpdateInput = {
    endTime,
    duration,
    isRunning: false,
    isPaused: false,
  };

  if (options && "description" in options) {
    updateData.description = options.description?.trim() || null;
  }

  const updated = await prisma.timeEntry.update({
    where: { id: entry.id },
    data: updateData,
    include: timeEntryInclude,
  });

  if (options?.labelIds) {
    await syncEntryLabels(entry.id, options.labelIds, entry.userId);
  }

  const withLabels = options?.labelIds
    ? await prisma.timeEntry.findUniqueOrThrow({
        where: { id: entry.id },
        include: timeEntryInclude,
      })
    : updated;

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
    withLabels.task = { ...withLabels.task!, status: options.taskStatus };
  }

  const formatted = formatTimeEntryForClient(withLabels);
  await logTaskActivity(
    entry.taskId,
    "time_stopped",
    `${actorName} stopped timer (${formatDurationShort(duration)})`
  );
  await emitTimeEvent("time:stopped", formatted, actorId);
  return formatted;
}

export async function pauseTimer(
  userId: string,
  timeEntryId?: string,
  reason?: "manual" | "idle"
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
  if (entry.isPaused) throw new Error("Timer is already paused");

  const now = new Date();
  const duration = finalizeDuration(entry, now);
  const actorName = await getUserName(userId);

  const updated = await prisma.timeEntry.update({
    where: { id: entry.id },
    data: { duration, isPaused: true },
    include: timeEntryInclude,
  });

  const formatted = formatTimeEntryForClient(updated);
  const reasonLabel = reason === "idle" ? " (idle)" : "";
  await logTaskActivity(
    entry.taskId,
    "time_paused",
    `${actorName} paused timer${reasonLabel} (${formatDurationShort(duration)})`
  );
  await emitTimeEvent("time:paused", formatted, userId);
  return formatted;
}

export async function resumePausedTimer(userId: string, timeEntryId?: string) {
  const entry = timeEntryId
    ? await prisma.timeEntry.findFirst({
        where: { id: timeEntryId, userId, isRunning: true, isPaused: true },
        include: timeEntryInclude,
      })
    : await prisma.timeEntry.findFirst({
        where: { userId, isRunning: true, isPaused: true },
        include: timeEntryInclude,
      });

  if (!entry) throw new Error("No paused timer found");

  const actorName = await getUserName(userId);
  const updated = await prisma.timeEntry.update({
    where: { id: entry.id },
    data: { startTime: new Date(), isPaused: false },
    include: timeEntryInclude,
  });

  const formatted = formatTimeEntryForClient(updated);
  await logTaskActivity(entry.taskId, "time_resumed", `${actorName} resumed timer`);
  await emitTimeEvent("time:resumed", formatted, userId);
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
  description?: string | null,
  options?: { promoteStatus?: boolean }
) {
  if (!(await canStartTimer(userId, taskId))) {
    throw new Error("Forbidden");
  }

  const task = await canAccessTask(userId, taskId);
  if (!task) throw new Error("Task not found");

  const actorName = await getUserName(userId);
  const shouldPromote = options?.promoteStatus !== false;

  let statusPromoted = false;
  const entry = await prisma.$transaction(async (tx) => {
    const running = await tx.timeEntry.findFirst({
      where: { userId, isRunning: true },
    });
    if (running) {
      const endTime = new Date();
      const duration = finalizeDuration(running, endTime);
      await tx.timeEntry.update({
        where: { id: running.id },
        data: { endTime, duration, isRunning: false, isPaused: false },
      });
      await logTaskActivity(
        running.taskId,
        "time_stopped",
        `${actorName} stopped timer (${formatDurationShort(duration)})`
      );
    }

    if (shouldPromote) {
      statusPromoted = await promoteTaskToInProgress(tx, {
        id: task.id,
        status: task.status,
        userId: task.userId,
        workspaceId: task.workspaceId,
      });
    }

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
  description?: string | null,
  options?: { promoteStatus?: boolean }
) {
  const paused = await prisma.timeEntry.findFirst({
    where: { userId, isRunning: true, isPaused: true },
  });
  if (paused) {
    return resumePausedTimer(userId, paused.id);
  }
  return startTimer(userId, taskId, description, options);
}

export async function createManualEntry(
  userId: string,
  input: {
    taskId: string;
    date: string;
    durationSeconds: number;
    description?: string | null;
    labelIds?: string[];
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

  if (input.labelIds?.length) {
    await syncEntryLabels(entry.id, input.labelIds, userId);
  }

  const withLabels = input.labelIds?.length
    ? await prisma.timeEntry.findUniqueOrThrow({
        where: { id: entry.id },
        include: timeEntryInclude,
      })
    : entry;

  const formatted = formatTimeEntryForClient(withLabels);
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
    reminderSnoozedUntil?: string | null;
    labelIds?: string[];
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

  if (input.reminderSnoozedUntil !== undefined) {
    if (input.reminderSnoozedUntil === null) {
      data.reminderSnoozedUntil = null;
    } else {
      const parsed = new Date(input.reminderSnoozedUntil);
      if (Number.isNaN(parsed.getTime())) throw new Error("Invalid snooze time");
      data.reminderSnoozedUntil = parsed;
    }
  }

  if (entry.isRunning) {
    const hasNonDescriptionFields =
      input.startTime !== undefined ||
      input.endTime !== undefined ||
      input.durationSeconds !== undefined;
    if (hasNonDescriptionFields) {
      throw new Error("Cannot edit duration on a running timer");
    }
    if (
      input.description === undefined &&
      input.reminderSnoozedUntil === undefined &&
      input.labelIds === undefined
    ) {
      throw new Error("No updates provided");
    }
    const updated = await prisma.timeEntry.update({
      where: { id: entryId },
      data,
      include: timeEntryInclude,
    });
    if (input.labelIds) {
      await syncEntryLabels(entryId, input.labelIds, entry.userId);
    }
    const withLabels = input.labelIds
      ? await prisma.timeEntry.findUniqueOrThrow({
          where: { id: entryId },
          include: timeEntryInclude,
        })
      : updated;
    const formatted = formatTimeEntryForClient(withLabels);
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

  if (input.labelIds) {
    await syncEntryLabels(entryId, input.labelIds, entry.userId);
  }

  const withLabels = input.labelIds
    ? await prisma.timeEntry.findUniqueOrThrow({
        where: { id: entryId },
        include: timeEntryInclude,
      })
    : updated;

  const formatted = formatTimeEntryForClient(withLabels);
  await logTaskActivity(
    entry.taskId,
    "time_entry_edited",
    `${actorName} edited time entry (${formatDurationShort(withLabels.duration)})`
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

  const editFlags = await canEditFlagsForTaskEntries(
    actorId,
    taskId,
    entries.map((entry) => entry.userId)
  );
  const withPermissions = entries.map((entry) => {
    const formatted = formatTimeEntryForClient(entry);
    formatted.canEdit = editFlags.get(entry.userId) ?? false;
    return formatted;
  });

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
    where.task = visibleTaskWhere({ userId: targetUserId, workspaceId: null });
  } else if (query.workspaceId) {
    where.task = visibleTaskWhere({ workspaceId: query.workspaceId });
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
    task: visibleTaskWhere({ workspaceId }),
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

export async function splitTimeEntry(
  actorId: string,
  entryId: string,
  segments: {
    durationSeconds: number;
    taskId?: string;
    description?: string | null;
    labelIds?: string[];
  }[]
) {
  const entry = await prisma.timeEntry.findUnique({
    where: { id: entryId },
    include: timeEntryInclude,
  });
  if (!entry) throw new Error("Time entry not found");
  if (entry.isRunning) throw new Error("Stop the timer before splitting");
  if (!(await canEditTimeEntry(actorId, entry))) throw new Error("Forbidden");

  const validationError = validateSplitSegments(entry.duration, segments);
  if (validationError) throw new Error(validationError);

  const actorName = await getUserName(actorId);
  const sourceLabels = (entry.labels ?? []).map((t) => t.label.id);
  const foreignTaskIds = [
    ...new Set(
      segments
        .map((segment) => segment.taskId ?? entry.taskId)
        .filter((taskId) => taskId !== entry.taskId)
    ),
  ];
  if (foreignTaskIds.length > 0) {
    const allowed = await Promise.all(foreignTaskIds.map((taskId) => canStartTimer(actorId, taskId)));
    if (allowed.some((ok) => !ok)) throw new Error("Forbidden");
  }

  const created = await prisma.$transaction(async (tx) => {
    const results = [];
    let cursor = entry.startTime.getTime();

    for (const seg of segments) {
      const taskId = seg.taskId ?? entry.taskId;
      const startTime = new Date(cursor);
      const endTime = new Date(cursor + seg.durationSeconds * 1000);
      cursor = endTime.getTime();

      const row = await tx.timeEntry.create({
        data: {
          userId: entry.userId,
          taskId,
          description: seg.description?.trim() ?? entry.description,
          startTime,
          endTime,
          duration: seg.durationSeconds,
          isRunning: false,
        },
        include: timeEntryInclude,
      });
      results.push({ row, labelIds: seg.labelIds ?? sourceLabels });
    }

    await tx.timeEntry.delete({ where: { id: entryId } });
    return results;
  });

  for (const { row, labelIds } of created) {
    if (labelIds.length) await syncEntryLabels(row.id, labelIds, entry.userId);
  }

  const createdIds = created.map(({ row }) => row.id);
  const fullRows = await prisma.timeEntry.findMany({
    where: { id: { in: createdIds } },
    include: timeEntryInclude,
  });
  const fullById = new Map(fullRows.map((row) => [row.id, row]));
  const formatted = createdIds.map((id) => {
    const full = fullById.get(id);
    if (!full) throw new Error("Time entry not found");
    return formatTimeEntryForClient(full);
  });

  await logTaskActivity(
    entry.taskId,
    "time_entry_split",
    `${actorName} split time entry into ${segments.length} parts`
  );
  await emitTimeEvent("time:updated", formatted[0]!, actorId);
  return formatted;
}

export async function mergeTimeEntries(actorId: string, entryIds: string[]) {
  if (entryIds.length < 2) throw new Error("At least two entries required");

  const entries = await prisma.timeEntry.findMany({
    where: { id: { in: entryIds } },
    include: timeEntryInclude,
    orderBy: { startTime: "asc" },
  });

  if (entries.length !== entryIds.length) throw new Error("Time entry not found");

  const userId = entries[0]!.userId;
  const taskId = entries[0]!.taskId;
  const entriesByTask = new Map<string, string[]>();
  for (const entry of entries) {
    const userIds = entriesByTask.get(entry.taskId) ?? [];
    userIds.push(entry.userId);
    entriesByTask.set(entry.taskId, userIds);
  }
  const editMaps = await Promise.all(
    [...entriesByTask.entries()].map(async ([entryTaskId, userIds]) => ({
      entryTaskId,
      flags: await canEditFlagsForTaskEntries(actorId, entryTaskId, userIds),
    }))
  );
  const editByTask = new Map(editMaps.map((item) => [item.entryTaskId, item.flags]));
  for (const e of entries) {
    if (e.isRunning) throw new Error("Stop all timers before merging");
    if (e.userId !== userId) throw new Error("Entries must belong to the same user");
    if (!editByTask.get(e.taskId)?.get(e.userId)) throw new Error("Forbidden");
  }

  const actorName = await getUserName(actorId);
  const startTime = entries[0]!.startTime;
  const endTime = entries[entries.length - 1]!.endTime ?? entries[entries.length - 1]!.startTime;
  const duration = entries.reduce((sum, e) => sum + e.duration, 0);
  const descriptions = entries
    .map((e) => e.description?.trim())
    .filter(Boolean)
    .join(" / ");

  const allLabelIds = [
    ...new Set(entries.flatMap((e) => (e.labels ?? []).map((t) => t.label.id))),
  ];

  const merged = await prisma.$transaction(async (tx) => {
    await tx.timeEntry.deleteMany({ where: { id: { in: entryIds } } });
    return tx.timeEntry.create({
      data: {
        userId,
        taskId,
        description: descriptions || null,
        startTime,
        endTime,
        duration,
        isRunning: false,
      },
      include: timeEntryInclude,
    });
  });

  if (allLabelIds.length) await syncEntryLabels(merged.id, allLabelIds, userId);

  const full = await prisma.timeEntry.findUniqueOrThrow({
    where: { id: merged.id },
    include: timeEntryInclude,
  });
  const formatted = formatTimeEntryForClient(full);

  await logTaskActivity(
    taskId,
    "time_entry_merged",
    `${actorName} merged ${entries.length} time entries`
  );
  await emitTimeEvent("time:updated", formatted, actorId);
  return formatted;
}

export async function duplicateLastTimeEntry(
  actorId: string,
  taskId?: string
) {
  const where: Prisma.TimeEntryWhereInput = {
    userId: actorId,
    isRunning: false,
  };
  if (taskId) where.taskId = taskId;

  const last = await prisma.timeEntry.findFirst({
    where,
    include: timeEntryInclude,
    orderBy: { startTime: "desc" },
  });
  if (!last) throw new Error("No time entries to duplicate");

  const targetTaskId = taskId ?? last.taskId;
  if (!(await canStartTimer(actorId, targetTaskId))) throw new Error("Forbidden");

  const now = new Date();
  const endTime = new Date(now);
  endTime.setHours(12, 0, 0, 0);
  const startTime = new Date(endTime.getTime() - last.duration * 1000);

  const entry = await prisma.timeEntry.create({
    data: {
      userId: actorId,
      taskId: targetTaskId,
      description: last.description,
      startTime,
      endTime,
      duration: last.duration,
      isRunning: false,
    },
    include: timeEntryInclude,
  });

  const labelIds = (last.labels ?? []).map((t) => t.label.id);
  if (labelIds.length) await syncEntryLabels(entry.id, labelIds, actorId);

  const full = await prisma.timeEntry.findUniqueOrThrow({
    where: { id: entry.id },
    include: timeEntryInclude,
  });
  const formatted = formatTimeEntryForClient(full);
  const actorName = await getUserName(actorId);

  await logTaskActivity(
    targetTaskId,
    "time_duplicated",
    `${actorName} duplicated last time entry (${formatDurationShort(last.duration)})`
  );
  await emitTimeEvent("time:updated", formatted, actorId);
  return formatted;
}
