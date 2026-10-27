import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { canEditWorkspaceTasks, getWorkspaceMembership } from "@/lib/workspace";
import { syncTaskAssignees, getTaskWithAssignees } from "@/lib/task-assignees";
import { taskListInclude } from "@/lib/tasks";
import { taskSchema } from "@/lib/validations";
import { placementForNewTask } from "@/lib/projects";
import { visibleTaskWhere } from "@/lib/visible-records";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const membership = await getWorkspaceMembership(user.id, id);
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const workspace = await prisma.workspace.findUnique({
      where: { id },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const tasks = await prisma.task.findMany({
      where: visibleTaskWhere({ workspaceId: id, archived: false }),
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      include: taskListInclude,
    });

    return NextResponse.json({ workspace, tasks });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const membership = await getWorkspaceMembership(user.id, id);
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!canEditWorkspaceTasks(membership)) {
      return NextResponse.json({ error: "Viewers cannot create tasks" }, { status: 403 });
    }

    const data = taskSchema.parse(await request.json());
    const { assigneeIds, primaryAssigneeId, tagIds, ...taskData } = data;

    const placement = await placementForNewTask({
      userId: user.id,
      workspaceId: id,
      projectId: taskData.projectId,
      sectionId: taskData.sectionId,
    });

    const task = await prisma.task.create({
      data: {
        title: taskData.title,
        description: taskData.description || null,
        priority: taskData.priority ?? "MEDIUM",
        status: taskData.status ?? "PENDING",
        dueDate: taskData.dueDate ? new Date(taskData.dueDate) : null,
        workspaceId: id,
        projectId: placement.projectId,
        sectionId: placement.sectionId,
        position: placement.position,
        userId: user.id,
        tags: tagIds?.length ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
      },
    });

    if (assigneeIds?.length) {
      const workspace = await prisma.workspace.findUnique({ where: { id }, select: { name: true } });
      await syncTaskAssignees({
        taskId: task.id,
        workspaceId: id,
        assigneeIds,
        primaryAssigneeId,
        actorId: user.id,
        actorName: user.name,
        taskTitle: task.title,
        workspaceName: workspace?.name,
      });
    }

    const fullTask = await getTaskWithAssignees(task.id);
    return NextResponse.json({ task: fullTask }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
