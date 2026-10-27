import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bulkTaskSchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { canAccessTask, canEditTask } from "@/lib/workspace";
import { broadcastTaskEvent } from "@/lib/realtime";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { taskIds, action } = bulkTaskSchema.parse(body);

    const accessibleTasks = await Promise.all(
      taskIds.map(async (id) => canAccessTask(user.id, id))
    );
    const tasks = accessibleTasks.filter((t): t is NonNullable<typeof t> => t !== null);
    let affected = tasks;

    if (action === "delete") {
      const editable = [];
      for (const task of tasks) {
        if (await canEditTask(user.id, task.id)) editable.push(task);
      }
      if (editable.length === 0) {
        return NextResponse.json({ error: "You do not have permission to delete these tasks" }, { status: 403 });
      }
      affected = editable;
      await prisma.task.updateMany({
        where: { id: { in: editable.map((task) => task.id) }, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    } else if (action === "archive") {
      await prisma.task.updateMany({ where: { id: { in: tasks.map((task) => task.id) } }, data: { archived: true } });
    } else if (action === "complete") {
      await prisma.task.updateMany({
        where: { id: { in: tasks.map((task) => task.id) } },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    } else if (action === "pending") {
      await prisma.task.updateMany({
        where: { id: { in: tasks.map((task) => task.id) } },
        data: { status: "PENDING", completedAt: null },
      });
    }

    const seen = new Set<string>();
    for (const task of affected) {
      const key = task.workspaceId ?? `personal:${task.userId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      broadcastTaskEvent({
        type: "task:bulk",
        workspaceId: task.workspaceId,
        ownerId: task.userId,
        actorId: user.id,
      });
    }

    return NextResponse.json({ message: `Bulk ${action} completed`, count: affected.length });
  } catch (error) {
    return handleApiError(error);
  }
}
