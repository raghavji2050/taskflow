import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { ProjectError } from "@/lib/project-sections";
import { listVisibleProjects, requireProjectAccess } from "@/lib/projects";
import { getWorkspaceMembership } from "@/lib/workspace";
import { visibleTaskWhere } from "@/lib/visible-records";
import { computeInsights } from "@/lib/insights";

const MAX_TASKS = 5000;

export type InsightScope = {
  workspaceId?: string | null;
  projectId?: string | null;
  tzOffsetMinutes?: number;
  weeks?: number;
  now?: Date;
};

/** Load and aggregate dashboard numbers for a personal space, a workspace, or one project. */
export async function loadInsights(userId: string, scope: InsightScope) {
  let where: Prisma.TaskWhereInput;
  let workspaceId: string | null = null;
  let scopeLabel: "personal" | "workspace" | "project" = "personal";

  if (scope.projectId) {
    const access = await requireProjectAccess(userId, scope.projectId);
    if (scope.workspaceId && scope.workspaceId !== access.project.workspaceId) {
      throw new ProjectError("Project is not in this workspace", 400);
    }
    workspaceId = access.project.workspaceId;
    where = { projectId: scope.projectId };
    scopeLabel = "project";
  } else if (scope.workspaceId) {
    const membership = await getWorkspaceMembership(userId, scope.workspaceId);
    if (!membership) throw new ProjectError("Forbidden", 403);
    workspaceId = scope.workspaceId;
    where = { workspaceId };
    scopeLabel = "workspace";
  } else {
    where = { userId, workspaceId: null };
  }

  const [rows, members, projects] = await Promise.all([
    prisma.task.findMany({
      where: visibleTaskWhere(where),
      select: {
        status: true,
        dueDate: true,
        completedAt: true,
        createdAt: true,
        archived: true,
        projectId: true,
        assignees: { select: { userId: true } },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_TASKS,
    }),
    workspaceId
      ? prisma.workspaceMember.findMany({
          where: { workspaceId },
          select: { user: { select: { id: true, name: true } } },
        })
      : Promise.resolve([]),
    workspaceId && scopeLabel === "workspace" ? listVisibleProjects(userId, workspaceId, "false") : Promise.resolve([]),
  ]);

  const insights = computeInsights(
    rows.map((t) => ({ ...t, assigneeIds: t.assignees.map((a) => a.userId) })),
    {
      now: scope.now,
      tzOffsetMinutes: scope.tzOffsetMinutes,
      weeks: scope.weeks,
      members: members.map((m) => ({ id: m.user.id, name: m.user.name ?? "Unknown" })),
      projects: (projects as { id: string; name: string; color?: string | null }[]).map((p) => ({ id: p.id, name: p.name, color: p.color ?? null })),
    }
  );

  return { scope: scopeLabel, workspaceId, projectId: scope.projectId ?? null, truncated: rows.length >= MAX_TASKS, ...insights };
}
