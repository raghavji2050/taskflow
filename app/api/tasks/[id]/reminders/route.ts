import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reminderSchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const task = await prisma.task.findFirst({ where: { id, userId: user.id } });
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data = reminderSchema.parse(await request.json());
    const reminder = await prisma.reminder.create({
      data: { remindAt: new Date(data.remindAt), taskId: id },
    });

    return NextResponse.json({ reminder }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
