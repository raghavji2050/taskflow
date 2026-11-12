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
import { nextSectionPosition, projectFieldsForTaskUpdate } from "@/lib/projects";
import { visibleTaskWhere } from "@/lib/visible-records";
import { notifyTaskFollowers, statusLabel } from "@/lib/task-followers";
import { getOpenBlockers, notifyUnblocked } from "@/lib/task-dependencies";
import { shiftDependentsAfterDueChange, type ShiftedTask } from "@/lib/dependency-shift";
import { recordAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const accessible = await canAccessTask(user.id, id);
    if (!accessible) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const task = await prisma.task.findFirst({
      where: visibleTaskWhere({ id }),
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
    const projectFields = await projectFieldsForTaskUpdate({
      userId: user.id,
      workspaceId: existing.workspaceId,
      currentProjectId: existing.projectId,
      currentSectionId: existing.sectionId,
      projectId: taskData.projectId,
      sectionId: taskData.sectionId,
    });

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
        estimatedMinutes: taskData.estimatedMinutes ?? null,
        position: taskData.position,
        ...(projectFields ?? {}),
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
      where: visibleTaskWhere({ id }),
      include: taskDetailInclude,
    });

    await logTaskActivity(id, "updated", `Status: ${taskData.status}`);

    // Auto date-shift: blocker moved later -> push open dependents by the same amount.
    // Clients can opt out with shiftDependents: false.
    let shifted: ShiftedTask[] = [];
    if (body?.shiftDependents !== false) {
      shifted = await shiftDependentsAfterDueChange({
        userId: user.id,
        taskId: id,
        scope: existing,
        oldDue: existing.dueDate ?? null,
        newDue: task?.dueDate ?? null,
      });
    }

    if (statusChanged) {
      await notifyTaskFollowers({
        taskId: id,
        workspaceId: workspaceId ?? null,
        actorId: user.id,
        title: "Task status changed",
        body: `${user.name} changed "${taskData.title}" to ${statusLabel(taskData.status)}`,
        type: "task_status",
      });
    }

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
          projectId: task.projectId,
          sectionId: task.sectionId,
          position: task.sectionId ? await nextSectionPosition(task.sectionId) : task.position + 1,
        },
      });
    }

    // Dependencies: completing is allowed, but warn when blockers are still open,
    // and tell people on tasks that just became fully unblocked.
    let warning: { message: string; openBlockers: { id: string; title: string }[] } | undefined;
    if (taskData.status === "COMPLETED" && existing.status !== "COMPLETED") {
      const open = await getOpenBlockers(id);
      if (open.length) {
        warning = {
          message: `Marked done while ${open.length} blocking task${open.length === 1 ? " is" : "s are"} still open`,
          openBlockers: open.map((b) => ({ id: b.id, title: b.title })),
        };
      }
      await notifyUnblocked(id, user.id);
    }

    broadcastTaskEvent({
      type: "task:updated",
      workspaceId: existing.workspaceId,
      ownerId: existing.userId,
      actorId: user.id,
      taskId: id,
    });
    return NextResponse.json({
      task,
      ...(warning ? { warning } : {}),
      ...(shifted.length ? { shifted } : {}),
    });
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

    await prisma.task.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    if (existing.workspaceId) await recordAudit({ workspaceId: existing.workspaceId, actorId: user.id, action: "task.deleted", targetType: "task", targetId: id, targetLabel: existing.title });
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

    // Due-date-only patch (used by "Undo" after an auto date-shift). Never cascades.
    if (Object.keys(body ?? {}).length === 1 && "dueDate" in body) {
      const due = body.dueDate === null ? null : new Date(String(body.dueDate));
      if (due && Number.isNaN(due.getTime())) {
        return NextResponse.json({ error: "Invalid dueDate" }, { status: 400 });
      }
      const task = await prisma.task.update({
        where: { id },
        data: { dueDate: due },
        include: taskDetailInclude,
      });
      await logTaskActivity(id, "updated", "Due date changed");
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
