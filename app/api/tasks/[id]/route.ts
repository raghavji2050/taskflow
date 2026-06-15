import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { taskSchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { logTaskActivity } from "@/lib/activity";
import { getNextDueDate } from "@/lib/recurrence";
import { canAccessTask, canEditTask } from "@/lib/workspace";
import { broadcastTaskEvent } from "@/lib/realtime";
import { completedAtForStatusChange } from "@/lib/auto-archive";
import { syncTaskAssignees, getTaskWithAssignees } from "@/lib/task-assignees";
import { runAutomationsForTrigger } from "@/lib/automations";
import { taskDetailInclude } from "@/lib/tasks";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const accessible = await canAccessTask(user.id, id);
    if (!accessible) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const task = await prisma.task.findFirst({
      where: { id },
      include: taskDetailInclude,
    });

    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    return NextResponse.json({ task });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const existing = await canAccessTask(user.id, id);
    if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    if (!(await canEditTask(user.id, id))) {
      return NextResponse.json({ error: "You do not have permission to edit this task" }, { status: 403 });
    }

    const body = await request.json();
    const data = taskSchema.parse(body);
    const { tagIds, assigneeIds, primaryAssigneeId, ...taskData } = data;

    if (tagIds) {
      await prisma.taskTag.deleteMany({ where: { taskId: id } });
      if (tagIds.length) {
        await prisma.taskTag.createMany({
          data: tagIds.map((tagId) => ({ taskId: id, tagId })),
        });
      }
    }

    const completedAt = completedAtForStatusChange(taskData.status, existing.status);
    const statusChanged = taskData.status !== existing.status;

    await prisma.task.update({
      where: { id },
      data: {
        title: taskData.title,
        description: taskData.description || null,
        priority: taskData.priority,
        status: taskData.status,
        dueDate: taskData.dueDate ? new Date(taskData.dueDate) : null,
        categoryId: taskData.categoryId || null,
        boardColumnId: taskData.boardColumnId ?? null,
        recurrenceRule: taskData.recurrenceRule || null,
        position: taskData.position,
        ...(completedAt !== undefined && { completedAt }),
      },
    });

    const workspaceId = existing.workspaceId ?? taskData.workspaceId ?? null;
    if (workspaceId && assigneeIds !== undefined) {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true },
      });
      await syncTaskAssignees({
        taskId: id,
        workspaceId,
        assigneeIds: assigneeIds ?? [],
        primaryAssigneeId,
        actorId: user.id,
        actorName: user.name,
        taskTitle: taskData.title,
        workspaceName: workspace?.name,
      });
    }

    const task = await prisma.task.findFirst({
      where: { id },
      include: taskDetailInclude,
    });

    await logTaskActivity(id, "updated", `Status: ${taskData.status}`);

    if (statusChanged && workspaceId) {
      await runAutomationsForTrigger(workspaceId, "status_changed", {
        taskId: id,
        taskTitle: taskData.title,
        workspaceId,
        status: taskData.status,
        assigneeIds: assigneeIds ?? [],
      });
    }

    if (
      taskData.status === "COMPLETED" &&
      existing.status !== "COMPLETED" &&
      task?.recurrenceRule &&
      task.dueDate
    ) {
      await prisma.task.create({
        data: {
          title: task.title,
          description: task.description,
          priority: task.priority,
          status: "PENDING",
          dueDate: getNextDueDate(task.dueDate, task.recurrenceRule),
          recurrenceRule: task.recurrenceRule,
          categoryId: task.categoryId,
          userId: user.id,
          workspaceId: task.workspaceId,
          position: task.position + 1,
        },
      });
    }

    broadcastTaskEvent({
      type: "task:updated",
      workspaceId: existing.workspaceId,
      ownerId: existing.userId,
      actorId: user.id,
      taskId: id,
    });
    return NextResponse.json({ task });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const existing = await canAccessTask(user.id, id);
    if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    if (!(await canEditTask(user.id, id))) {
      return NextResponse.json({ error: "You do not have permission to delete this task" }, { status: 403 });
    }

    await prisma.task.delete({ where: { id } });
    broadcastTaskEvent({
      type: "task:deleted",
      workspaceId: existing.workspaceId,
      ownerId: existing.userId,
      actorId: user.id,
      taskId: id,
    });
    return NextResponse.json({ message: "Task deleted" });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const existing = await canAccessTask(user.id, id);
    if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    if (!(await canEditTask(user.id, id))) {
      return NextResponse.json({ error: "You do not have permission to edit this task" }, { status: 403 });
    }

    const body = await request.json();

    if (body.archived !== undefined) {
      const task = await prisma.task.update({
        where: { id },
        data: { archived: Boolean(body.archived) },
        include: taskDetailInclude,
      });
      await logTaskActivity(id, body.archived ? "archived" : "unarchived");
      broadcastTaskEvent({
        type: "task:updated",
        workspaceId: task.workspaceId,
        ownerId: existing.userId,
        actorId: user.id,
        taskId: task.id,
      });
      return NextResponse.json({ task });
    }

    return NextResponse.json({ error: "Invalid patch" }, { status: 400 });
  } catch (error) {
    return handleApiError(error);
  }
}
