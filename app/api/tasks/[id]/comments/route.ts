import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { commentSchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { canAccessTask, canEditTask, getWorkspaceMembers } from "@/lib/workspace";
import { logTaskActivity } from "@/lib/activity";
import { createNotification } from "@/lib/notifications";
import { matchMentionedUsers, parseMentionNames } from "@/lib/mentions";
import { broadcastTaskEvent } from "@/lib/realtime";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    if (!(await canAccessTask(user.id, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const comments = await prisma.comment.findMany({
      where: { taskId: id, parentId: null },
      include: {
        user: { select: { id: true, name: true } },
        replies: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ comments });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const task = await canAccessTask(user.id, id);
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await canEditTask(user.id, id))) {
      return NextResponse.json({ error: "Viewers cannot comment" }, { status: 403 });
    }

    const data = commentSchema.parse(await request.json());
    const comment = await prisma.comment.create({
      data: {
        body: data.body,
        taskId: id,
        userId: user.id,
        parentId: data.parentId || null,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    await logTaskActivity(id, "commented", `${user.name} commented`);

    if (task.workspaceId) {
      const members = await getWorkspaceMembers(task.workspaceId);
      const mentioned = matchMentionedUsers(
        parseMentionNames(data.body),
        members.map((m) => m.user)
      );
      for (const m of mentioned) {
        if (m.id === user.id) continue;
        await createNotification({
          userId: m.id,
          title: "You were mentioned",
          body: `${user.name} mentioned you on "${task.title}"`,
          type: "mention",
        });
      }
    }

    broadcastTaskEvent({
      type: "comment:created",
      workspaceId: task.workspaceId,
      ownerId: task.userId,
      actorId: user.id,
      taskId: id,
    });
    broadcastTaskEvent({
      type: "task:updated",
      workspaceId: task.workspaceId,
      ownerId: task.userId,
      actorId: user.id,
      taskId: id,
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
