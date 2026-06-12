import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { taskSchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { logTaskActivity } from "@/lib/activity";
import { getNextDueDate } from "@/lib/recurrence";
import { canAccessTask } from "@/lib/workspace";
import { broadcastTaskEvent } from "@/lib/realtime";
import { completedAtForStatusChange } from "@/lib/auto-archive";

type RouteContext = { params: Promise<{ id: string }> };

const taskInclude = {
  category: true,
  tags: { include: { tag: true } },
  subtasks: { orderBy: { position: "asc" as const } },
  comments: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" as const } },
  attachments: true,
  activities: { orderBy: { createdAt: "desc" as const }, take: 20 },
  reminders: true,
  assignee: { select: { id: true, name: true, email: true } },
};

async function getOwnedTask(taskId: string, userId: string) {
  return prisma.task.findFirst({ where: { id: taskId, userId } });
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const accessible = await canAccessTask(user.id, id);
    if (!accessible) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const task = await prisma.task.findFirst({
      where: { id },
      include: taskInclude,
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

    const body = await request.json();
    const data = taskSchema.parse(body);
    const { tagIds, ...taskData } = data;

    if (tagIds) {
      await prisma.taskTag.deleteMany({ where: { taskId: id } });
      if (tagIds.length) {
        await prisma.taskTag.createMany({
          data: tagIds.map((tagId) => ({ taskId: id, tagId })),
        });
      }
    }

    const completedAt = completedAtForStatusChange(taskData.status, existing.status);

    const task = await prisma.task.update({
      where: { id },
      data: {
        title: taskData.title,
        description: taskData.description || null,
        priority: taskData.priority,
        status: taskData.status,
        dueDate: taskData.dueDate ? new Date(taskData.dueDate) : null,
        categoryId: taskData.categoryId || null,
        assigneeId: taskData.assigneeId || null,
        recurrenceRule: taskData.recurrenceRule || null,
        position: taskData.position,
        ...(completedAt !== undefined && { completedAt }),
      },
      include: taskInclude,
    });

    await logTaskActivity(id, "updated", `Status: ${task.status}`);

    if (
      task.status === "COMPLETED" &&
      existing.status !== "COMPLETED" &&
      task.recurrenceRule &&
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
          position: task.position + 1,
        },
      });
    }

    broadcastTaskEvent({
      type: "task:updated",
      workspaceId: task.workspaceId,
      ownerId: existing.userId,
      actorId: user.id,
      taskId: task.id,
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

    const body = await request.json();

    if (body.archived !== undefined) {
      const task = await prisma.task.update({
        where: { id },
        data: { archived: Boolean(body.archived) },
        include: taskInclude,
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
