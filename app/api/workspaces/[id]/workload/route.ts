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

    const [members, tasks] = await Promise.all([
      prisma.workspaceMember.findMany({
        where: { workspaceId: id },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      prisma.task.findMany({
        where: { workspaceId: id, archived: false },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          assignees: { select: { userId: true } },
        },
        orderBy: { dueDate: "asc" },
      }),
    ]);

    const tasksByAssignee = new Map<string, typeof tasks>();
    let unassigned = 0;
    for (const task of tasks) {
      if (task.assignees.length === 0) {
        unassigned += 1;
        continue;
      }
      const seen = new Set<string>();
      for (const assignee of task.assignees) {
        if (seen.has(assignee.userId)) continue;
        seen.add(assignee.userId);
        const list = tasksByAssignee.get(assignee.userId) ?? [];
        list.push(task);
        tasksByAssignee.set(assignee.userId, list);
      }
    }

    const workload = members.map((member) => {
      const memberTasks = (tasksByAssignee.get(member.userId) ?? []).map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
      }));
      return {
        member: member.user,
        role: member.role,
        taskCount: memberTasks.length,
        tasks: memberTasks,
      };
    });

    return NextResponse.json({ workload, unassigned });
  } catch (error) {
    return handleApiError(error);
  }
}
