import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bulkTaskSchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { canAccessTask } from "@/lib/workspace";
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
    const ids = tasks.map((t) => t.id);

    if (action === "delete") {
      await prisma.task.deleteMany({ where: { id: { in: ids } } });
    } else if (action === "archive") {
      await prisma.task.updateMany({ where: { id: { in: ids } }, data: { archived: true } });
    } else if (action === "complete") {
      await prisma.task.updateMany({
        where: { id: { in: ids } },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    } else if (action === "pending") {
      await prisma.task.updateMany({
        where: { id: { in: ids } },
        data: { status: "PENDING", completedAt: null },
      });
    }

    const seen = new Set<string>();
    for (const task of tasks) {
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

    return NextResponse.json({ message: `Bulk ${action} completed`, count: ids.length });
  } catch (error) {
    return handleApiError(error);
  }
}
