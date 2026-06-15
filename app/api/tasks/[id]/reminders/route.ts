import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reminderSchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { canAccessTask, canEditTask } from "@/lib/workspace";
import { broadcastTaskEvent } from "@/lib/realtime";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const task = await canAccessTask(user.id, id);
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await canEditTask(user.id, id))) {
      return NextResponse.json({ error: "You do not have permission to edit this task" }, { status: 403 });
    }

    const data = reminderSchema.parse(await request.json());
    const reminder = await prisma.reminder.create({
      data: { remindAt: new Date(data.remindAt), taskId: id },
    });

    broadcastTaskEvent({
      type: "task:updated",
      workspaceId: task.workspaceId,
      ownerId: task.userId,
      actorId: user.id,
      taskId: id,
    });

    return NextResponse.json({ reminder }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
