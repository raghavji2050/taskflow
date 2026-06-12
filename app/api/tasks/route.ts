import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { taskSchema, taskQuerySchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { logTaskActivity } from "@/lib/activity";
import { isWorkspaceMember, canEditWorkspaceTasks, getWorkspaceMembership } from "@/lib/workspace";
import { broadcastTaskEvent } from "@/lib/realtime";
import { archiveStaleCompletedTasks } from "@/lib/auto-archive";
import { getDailyUpdatesByCategory } from "@/lib/daily-update";
import { syncTaskAssignees, getTaskWithAssignees } from "@/lib/task-assignees";
import { runAutomationsForTrigger } from "@/lib/automations";
import { taskListInclude } from "@/lib/tasks";

function applyAssigneeFilter(
  where: Prisma.TaskWhereInput,
  assignee: string,
  userId: string
) {
  if (assignee === "me") {
    where.assignees = { some: { userId } };
  } else if (assignee === "unassigned") {
    where.assignees = { none: {} };
  }
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await archiveStaleCompletedTasks();

    const { searchParams } = new URL(request.url);
    const query = taskQuerySchema.parse({
      search: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      priority: searchParams.get("priority") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
      order: searchParams.get("order") ?? undefined,
      archived: searchParams.get("archived") ?? undefined,
      categoryId: searchParams.get("categoryId") ?? undefined,
      tagId: searchParams.get("tagId") ?? undefined,
      workspaceId: searchParams.get("workspaceId") ?? undefined,
      assignee: searchParams.get("assignee") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    let where: Prisma.TaskWhereInput;

    if (query.workspaceId) {
      if (!(await isWorkspaceMember(user.id, query.workspaceId))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      where = { workspaceId: query.workspaceId };
    } else {
      where = { userId: user.id, workspaceId: null };
    }

    if (query.archived === "true") where.archived = true;
    else if (query.archived === "false") where.archived = false;

    if (query.status && query.status !== "ALL") where.status = query.status;
    if (query.priority && query.priority !== "ALL") where.priority = query.priority;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.tagId) where.tags = { some: { tagId: query.tagId } };
    if (query.workspaceId) applyAssigneeFilter(where, query.assignee, user.id);

    if (query.search) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { title: { contains: query.search } },
            { description: { contains: query.search } },
          ],
        },
      ];
    }

    const orderBy: Prisma.TaskOrderByWithRelationInput[] = [];
    if (query.sort === "priority") orderBy.push({ priority: query.order });
    else if (query.sort === "createdAt") orderBy.push({ createdAt: query.order });
    else if (query.sort === "position") orderBy.push({ position: query.order });
    else orderBy.push({ dueDate: query.order });

    const skip = (query.page - 1) * query.limit;
    const statsWhere = { ...where, archived: false };

    const [tasks, filteredTotal, breakdown, completed, inProgress, pending, highPriority, recentTasks, dailyUpdates] =
      await Promise.all([
        prisma.task.findMany({ where, orderBy, skip, take: query.limit, include: taskListInclude }),
        prisma.task.count({ where }),
        prisma.task.groupBy({ by: ["status", "priority"], where: statsWhere, _count: true }),
        prisma.task.count({ where: { ...statsWhere, status: "COMPLETED" } }),
        prisma.task.count({ where: { ...statsWhere, status: "IN_PROGRESS" } }),
        prisma.task.count({ where: { ...statsWhere, status: "PENDING" } }),
        prisma.task.count({ where: { ...statsWhere, priority: "HIGH", status: { not: "COMPLETED" } } }),
        prisma.task.findMany({
          where: statsWhere,
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            category: true,
            user: { select: { name: true } },
            assignees: { include: { user: { select: { name: true } } } },
          },
        }),
        query.workspaceId ? Promise.resolve([]) : getDailyUpdatesByCategory(user.id),
      ]);

    const total = completed + inProgress + pending;

    return NextResponse.json({
      tasks,
      pagination: {
        page: query.page,
        limit: query.limit,
        total: filteredTotal,
        totalPages: Math.ceil(filteredTotal / query.limit),
      },
      stats: {
        total,
        completed,
        inProgress,
        pending,
        highPriority,
        completionPercentage: total === 0 ? 0 : Math.round((completed / total) * 100),
        breakdown,
        recentTasks,
        dailyUpdates,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const data = taskSchema.parse(body);
    const { tagIds, assigneeIds, primaryAssigneeId, ...taskData } = data;

    if (taskData.workspaceId) {
      const membership = await getWorkspaceMembership(user.id, taskData.workspaceId);
      if (!membership) {
        return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
      }
      if (!canEditWorkspaceTasks(membership)) {
        return NextResponse.json({ error: "Viewers cannot create tasks" }, { status: 403 });
      }
    }

    const maxPos = await prisma.task.aggregate({
      where: taskData.workspaceId
        ? { workspaceId: taskData.workspaceId }
        : { userId: user.id, workspaceId: null },
      _max: { position: true },
    });

    const task = await prisma.task.create({
      data: {
        title: taskData.title,
        description: taskData.description || null,
        priority: taskData.priority,
        status: taskData.status,
        completedAt: taskData.status === "COMPLETED" ? new Date() : null,
        dueDate: taskData.dueDate ? new Date(taskData.dueDate) : null,
        categoryId: taskData.categoryId || null,
        workspaceId: taskData.workspaceId || null,
        recurrenceRule: taskData.recurrenceRule || null,
        position: (maxPos._max.position ?? 0) + 1,
        userId: user.id,
        tags: tagIds?.length ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
      },
    });

    if (taskData.workspaceId && assigneeIds?.length) {
      const workspace = await prisma.workspace.findUnique({
        where: { id: taskData.workspaceId },
        select: { name: true },
      });
      await syncTaskAssignees({
        taskId: task.id,
        workspaceId: taskData.workspaceId,
        assigneeIds,
        primaryAssigneeId,
        actorId: user.id,
        taskTitle: task.title,
        workspaceName: workspace?.name,
      });
      if (taskData.workspaceId) {
        await runAutomationsForTrigger(taskData.workspaceId, "task_assigned", {
          taskId: task.id,
          taskTitle: task.title,
          workspaceId: taskData.workspaceId,
          assigneeIds,
        });
      }
    }

    const fullTask = await getTaskWithAssignees(task.id);
    await logTaskActivity(task.id, "created", `Task "${task.title}" created`);
    broadcastTaskEvent({
      type: "task:created",
      workspaceId: task.workspaceId,
      ownerId: user.id,
      actorId: user.id,
      taskId: task.id,
    });
    return NextResponse.json({ task: fullTask }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
