import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { subtaskSchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string; subtaskId: string }> };

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, subtaskId } = await context.params;
    const task = await prisma.task.findFirst({ where: { id, userId: user.id } });
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data = subtaskSchema.parse(await request.json());
    const subtask = await prisma.subtask.update({
      where: { id: subtaskId, taskId: id },
      data: { title: data.title, completed: data.completed },
    });

    return NextResponse.json({ subtask });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, subtaskId } = await context.params;
    const task = await prisma.task.findFirst({ where: { id, userId: user.id } });
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.subtask.delete({ where: { id: subtaskId, taskId: id } });
    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    return handleApiError(error);
  }
}
