import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { isWorkspaceMember } from "@/lib/workspace";

type RouteContext = { params: Promise<{ id: string }> };

const taskInclude = {
  category: true,
  tags: { include: { tag: true } },
  subtasks: { orderBy: { position: "asc" as const } },
  assignee: { select: { id: true, name: true, email: true } },
  user: { select: { id: true, name: true } },
  workspace: { select: { id: true, name: true } },
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;

    if (!(await isWorkspaceMember(user.id, id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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
      where: { workspaceId: id, archived: false },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      include: taskInclude,
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

    if (!(await isWorkspaceMember(user.id, id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { title, description, priority, status, dueDate, assigneeId } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    if (assigneeId) {
      const assigneeIsMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId: id, userId: assigneeId },
      });
      if (!assigneeIsMember) {
        return NextResponse.json({ error: "Assignee must be a workspace member" }, { status: 400 });
      }
    }

    const task = await prisma.task.create({
      data: {
        title: title.trim(),
        description: description || null,
        priority: priority ?? "MEDIUM",
        status: status ?? "PENDING",
        dueDate: dueDate ? new Date(dueDate) : null,
        workspaceId: id,
        assigneeId: assigneeId || null,
        userId: user.id,
      },
      include: taskInclude,
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
