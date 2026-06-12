import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { commentSchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const comments = await prisma.comment.findMany({
      where: { taskId: id, task: { userId: user.id } },
      include: { user: { select: { id: true, name: true } } },
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
    const task = await prisma.task.findFirst({ where: { id, userId: user.id } });
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data = commentSchema.parse(await request.json());
    const comment = await prisma.comment.create({
      data: { body: data.body, taskId: id, userId: user.id },
      include: { user: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
