import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { isWorkspaceMember } from "@/lib/workspace";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    let where: Prisma.TaskWhereInput;
    if (workspaceId) {
      if (!(await isWorkspaceMember(user.id, workspaceId))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      where = { workspaceId };
    } else {
      where = { userId: user.id, workspaceId: null };
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        category: true,
        tags: { include: { tag: true } },
        subtasks: true,
        assignee: { select: { id: true, name: true, email: true } },
        user: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ tasks, exportedAt: new Date().toISOString(), workspaceId });
  } catch (error) {
    return handleApiError(error);
  }
}
