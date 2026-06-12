import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { taskListInclude } from "@/lib/tasks";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const now = new Date();

    const [assigned, overdue] = await Promise.all([
      prisma.task.findMany({
        where: {
          archived: false,
          assignees: { some: { userId: user.id } },
        },
        include: {
          ...taskListInclude,
          workspace: { select: { id: true, name: true } },
        },
        orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
        take: 100,
      }),
      prisma.task.findMany({
        where: {
          archived: false,
          status: { not: "COMPLETED" },
          dueDate: { lt: now },
          assignees: { some: { userId: user.id } },
        },
        include: taskListInclude,
        orderBy: { dueDate: "asc" },
        take: 20,
      }),
    ]);

    const byWorkspace = assigned.reduce<Record<string, typeof assigned>>((acc, task) => {
      const key = task.workspace?.name ?? "Personal";
      if (!acc[key]) acc[key] = [];
      acc[key].push(task);
      return acc;
    }, {});

    return NextResponse.json({
      assigned,
      overdue,
      byWorkspace,
      counts: {
        total: assigned.length,
        overdue: overdue.length,
        inProgress: assigned.filter((t) => t.status === "IN_PROGRESS").length,
        pending: assigned.filter((t) => t.status === "PENDING").length,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
