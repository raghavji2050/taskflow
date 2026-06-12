import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { subtaskSchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

async function verifyTask(taskId: string, userId: string) {
  return prisma.task.findFirst({ where: { id: taskId, userId } });
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    if (!(await verifyTask(id, user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const subtasks = await prisma.subtask.findMany({
      where: { taskId: id },
      orderBy: { position: "asc" },
    });

    return NextResponse.json({ subtasks });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    if (!(await verifyTask(id, user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data = subtaskSchema.parse(await request.json());
    const maxPos = await prisma.subtask.aggregate({ where: { taskId: id }, _max: { position: true } });

    const subtask = await prisma.subtask.create({
      data: {
        title: data.title,
        completed: data.completed ?? false,
        position: (maxPos._max.position ?? 0) + 1,
        taskId: id,
      },
    });

    return NextResponse.json({ subtask }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
