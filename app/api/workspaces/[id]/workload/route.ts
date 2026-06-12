import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { getWorkspaceMembership } from "@/lib/workspace";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const membership = await getWorkspaceMembership(user.id, id);
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    const workload = await Promise.all(
      members.map(async (member) => {
        const tasks = await prisma.task.findMany({
          where: {
            workspaceId: id,
            archived: false,
            assignees: { some: { userId: member.userId } },
          },
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
          },
          orderBy: { dueDate: "asc" },
        });
        return {
          member: member.user,
          role: member.role,
          taskCount: tasks.length,
          tasks,
        };
      })
    );

    const unassigned = await prisma.task.count({
      where: { workspaceId: id, archived: false, assignees: { none: {} } },
    });

    return NextResponse.json({ workload, unassigned });
  } catch (error) {
    return handleApiError(error);
  }
}
