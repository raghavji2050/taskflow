import { prisma } from "@/lib/prisma";
import { ProjectError } from "@/lib/project-sections";
import { requireProjectAccess } from "@/lib/projects";
import { canAccessTask, getWorkspaceMembership } from "@/lib/workspace";
import {
  MAX_GOAL_DEPTH,
  MAX_GOAL_LINKS,
  computeGoalProgress,
  expectedProgress,
  goalDepth,
  goalHealth,
  wouldCreateGoalCycle,
  type GoalStatusName,
  type ProgressPart,
} from "@/lib/goals";

export class GoalError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

async function membership(userId: string, workspaceId: string, edit: boolean) {
  const m = await getWorkspaceMembership(userId, workspaceId);
  if (!m) throw new GoalError("Workspace not found", 404);
  if (edit && m.role === "VIEWER") throw new GoalError("Viewers can't change goals", 403);
  return m;
}

async function goalFor(userId: string, goalId: string, edit: boolean) {
  const goal = await prisma.goal.findUnique({ where: { id: goalId } });
  if (!goal) throw new GoalError("Goal not found", 404);
  await membership(userId, goal.workspaceId, edit).catch(() => {
    throw new GoalError(edit ? "You can't edit this goal" : "Goal not found", edit ? 403 : 404);
  });
  return goal;
}

type GoalRow = Awaited<ReturnType<typeof loadRows>>[number];

function loadRows(workspaceId: string, includeClosed: boolean) {
  return prisma.goal.findMany({
    where: { workspaceId, ...(includeClosed ? {} : { closedAt: null }) },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    take: 500,
    include: {
      owner: { select: { id: true, name: true } },
      links: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          projectId: true,
          taskId: true,
          project: { select: { id: true, name: true, color: true, deletedAt: true, workspaceId: true } },
          task: { select: { id: true, title: true, status: true, deletedAt: true, projectId: true } },
        },
      },
    },
  });
}

/** Which of these projects can the viewer open? (Owners/admins see all; others need project membership.) */
async function visibleProjectIds(userId: string, workspaceId: string, role: string, ids: string[]) {
  if (ids.length === 0) return new Set<string>();
  if (role === "OWNER" || role === "ADMIN") return new Set(ids);
  const rows = await prisma.projectMember.findMany({ where: { userId, projectId: { in: ids } }, select: { projectId: true } });
  return new Set(rows.map((r) => r.projectId));
}

async function buildGoals(userId: string, workspaceId: string, role: string, rows: GoalRow[], now: Date) {
  const projectIds = [...new Set(rows.flatMap((g) => g.links.map((l) => l.projectId).filter((x): x is string => !!x)))];
  const counts = projectIds.length
    ? await prisma.task.groupBy({
        by: ["projectId", "status"],
        where: { projectId: { in: projectIds }, deletedAt: null },
        _count: { _all: true },
      })
    : [];
  const perProject = new Map<string, { total: number; done: number }>();
  for (const c of counts) {
    if (!c.projectId) continue;
    const cur = perProject.get(c.projectId) ?? { total: 0, done: 0 };
    cur.total += c._count._all;
    if (c.status === "COMPLETED") cur.done += c._count._all;
    perProject.set(c.projectId, cur);
  }
  const visibleProjects = await visibleProjectIds(userId, workspaceId, role, projectIds);
  const taskProjectIds = [...new Set(rows.flatMap((g) => g.links.map((l) => l.task?.projectId).filter((x): x is string => !!x)))];
  const visibleTaskProjects = await visibleProjectIds(userId, workspaceId, role, taskProjectIds);

  const byId = new Map(rows.map((g) => [g.id, g]));
  const childrenOf = new Map<string, string[]>();
  for (const g of rows) {
    if (g.parentId && byId.has(g.parentId)) childrenOf.set(g.parentId, [...(childrenOf.get(g.parentId) ?? []), g.id]);
  }
  const progressMemo = new Map<string, number>();
  const progressOf = (id: string, seen = new Set<string>()): number => {
    if (progressMemo.has(id)) return progressMemo.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const g = byId.get(id)!;
    const parts: ProgressPart[] = [];
    for (const l of g.links) {
      if (l.project && !l.project.deletedAt) parts.push({ kind: "project", ...(perProject.get(l.project.id) ?? { total: 0, done: 0 }) });
      if (l.task && !l.task.deletedAt) parts.push({ kind: "task", completed: l.task.status === "COMPLETED" });
    }
    for (const c of childrenOf.get(id) ?? []) parts.push({ kind: "goal", progress: progressOf(c, seen) });
    const value = computeGoalProgress(parts, g.manualProgress);
    progressMemo.set(id, value);
    return value;
  };

  return rows.map((g) => {
    const progress = progressOf(g.id);
    const links = g.links
      .filter((l) => (l.project ? !l.project.deletedAt : l.task ? !l.task.deletedAt : false))
      .map((l) => {
        if (l.project) {
          const visible = visibleProjects.has(l.project.id);
          const c = perProject.get(l.project.id) ?? { total: 0, done: 0 };
          return { id: l.id, kind: "project" as const, projectId: l.project.id, title: visible ? l.project.name : "Private project", color: l.project.color, visible, done: c.done, total: c.total };
        }
        const t = l.task!;
        const visible = !t.projectId || visibleTaskProjects.has(t.projectId);
        return { id: l.id, kind: "task" as const, taskId: t.id, title: visible ? t.title : "Private task", visible, completed: t.status === "COMPLETED" };
      });
    return {
      id: g.id,
      workspaceId: g.workspaceId,
      parentId: g.parentId && byId.has(g.parentId) ? g.parentId : null,
      title: g.title,
      description: g.description,
      owner: g.owner,
      startDate: g.startDate.toISOString(),
      dueDate: g.dueDate?.toISOString() ?? null,
      closedAt: g.closedAt?.toISOString() ?? null,
      manualProgress: g.manualProgress,
      statusOverride: g.statusOverride,
      progress,
      expectedProgress: expectedProgress(g.startDate, g.dueDate, now),
      status: goalHealth({ progress, startDate: g.startDate, dueDate: g.dueDate, now, statusOverride: g.statusOverride as GoalStatusName | null }),
      childIds: childrenOf.get(g.id) ?? [],
      links,
    };
  });
}

export type GoalView = Awaited<ReturnType<typeof buildGoals>>[number];

export async function listGoals(userId: string, workspaceId: string, opts: { includeClosed?: boolean; now?: Date } = {}) {
  const m = await membership(userId, workspaceId, false);
  const rows = await loadRows(workspaceId, opts.includeClosed ?? false);
  const goals = await buildGoals(userId, workspaceId, m.role, rows, opts.now ?? new Date());
  const summary = { total: goals.length, ON_TRACK: 0, AT_RISK: 0, OFF_TRACK: 0, ACHIEVED: 0 } as Record<string, number>;
  for (const g of goals) summary[g.status] += 1;
  return { goals, summary, canEdit: m.role !== "VIEWER" };
}

export async function getGoal(userId: string, goalId: string) {
  const goal = await goalFor(userId, goalId, false);
  const { goals } = await listGoals(userId, goal.workspaceId, { includeClosed: true });
  const found = goals.find((g) => g.id === goalId);
  if (!found) throw new GoalError("Goal not found", 404);
  return found;
}

async function parentMap(workspaceId: string) {
  const rows = await prisma.goal.findMany({ where: { workspaceId }, select: { id: true, parentId: true } });
  return new Map(rows.map((r) => [r.id, r.parentId]));
}

async function checkParent(workspaceId: string, goalId: string | null, parentId: string | null | undefined) {
  if (!parentId) return;
  const parent = await prisma.goal.findUnique({ where: { id: parentId }, select: { workspaceId: true } });
  if (!parent || parent.workspaceId !== workspaceId) throw new GoalError("Parent goal not found in this workspace", 400);
  const map = await parentMap(workspaceId);
  if (goalId && wouldCreateGoalCycle(goalId, parentId, map)) throw new GoalError("A goal can't sit under itself", 409);
  if (goalDepth(parentId, map) >= MAX_GOAL_DEPTH) throw new GoalError(`Goals can nest at most ${MAX_GOAL_DEPTH} levels`, 400);
}

async function checkOwner(workspaceId: string, ownerId: string | null | undefined) {
  if (!ownerId) return;
  if (!(await getWorkspaceMembership(ownerId, workspaceId))) throw new GoalError("Owner must be a workspace member", 400);
}

const toDate = (v: string | null | undefined) => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new GoalError("Invalid date", 400);
  return d;
};

export type GoalInput = {
  title?: string;
  description?: string | null;
  ownerId?: string | null;
  parentId?: string | null;
  dueDate?: string | null;
  startDate?: string | null;
  statusOverride?: GoalStatusName | null;
  manualProgress?: number | null;
  closed?: boolean;
};

export async function createGoal(userId: string, workspaceId: string, input: GoalInput & { title: string }) {
  await membership(userId, workspaceId, true);
  await checkParent(workspaceId, null, input.parentId);
  await checkOwner(workspaceId, input.ownerId);
  const count = await prisma.goal.count({ where: { workspaceId } });
  if (count >= 500) throw new GoalError("A workspace can have at most 500 goals", 400);
  const goal = await prisma.goal.create({
    data: {
      workspaceId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      ownerId: input.ownerId === undefined ? userId : input.ownerId,
      createdById: userId,
      parentId: input.parentId || null,
      dueDate: toDate(input.dueDate) ?? null,
      ...(input.startDate ? { startDate: toDate(input.startDate)! } : {}),
      statusOverride: input.statusOverride ?? null,
      manualProgress: input.manualProgress ?? null,
    },
  });
  return getGoal(userId, goal.id);
}

export async function updateGoal(userId: string, goalId: string, input: GoalInput) {
  const goal = await goalFor(userId, goalId, true);
  if (input.parentId !== undefined) await checkParent(goal.workspaceId, goal.id, input.parentId);
  if (input.ownerId !== undefined) await checkOwner(goal.workspaceId, input.ownerId);
  const startDate = toDate(input.startDate);
  await prisma.goal.update({
    where: { id: goalId },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId || null } : {}),
      ...(input.dueDate !== undefined ? { dueDate: toDate(input.dueDate) } : {}),
      ...(startDate ? { startDate } : {}),
      ...(input.statusOverride !== undefined ? { statusOverride: input.statusOverride } : {}),
      ...(input.manualProgress !== undefined ? { manualProgress: input.manualProgress } : {}),
      ...(input.closed !== undefined ? { closedAt: input.closed ? new Date() : null } : {}),
    },
  });
  return getGoal(userId, goalId);
}

export async function deleteGoal(userId: string, goalId: string) {
  await goalFor(userId, goalId, true);
  await prisma.goal.delete({ where: { id: goalId } });
  return { ok: true };
}

export async function addGoalLink(userId: string, goalId: string, target: { projectId?: string; taskId?: string }) {
  const goal = await goalFor(userId, goalId, true);
  if (!!target.projectId === !!target.taskId) throw new GoalError("Pass exactly one of projectId or taskId", 400);
  if ((await prisma.goalLink.count({ where: { goalId } })) >= MAX_GOAL_LINKS) throw new GoalError(`A goal can link at most ${MAX_GOAL_LINKS} items`, 400);
  if (target.projectId) {
    const access = await requireProjectAccess(userId, target.projectId).catch((e) => {
      if (e instanceof ProjectError) throw new GoalError("Project not found", 404);
      throw e;
    });
    if (access.project.workspaceId !== goal.workspaceId) throw new GoalError("Project is in another workspace", 400);
  } else {
    const task = await canAccessTask(userId, target.taskId!);
    if (!task || task.deletedAt) throw new GoalError("Task not found", 404);
    if (task.workspaceId !== goal.workspaceId) throw new GoalError("Task is in another workspace", 400);
  }
  const existing = await prisma.goalLink.findFirst({ where: { goalId, ...(target.projectId ? { projectId: target.projectId } : { taskId: target.taskId }) } });
  if (!existing) await prisma.goalLink.create({ data: { goalId, projectId: target.projectId ?? null, taskId: target.taskId ?? null } });
  return getGoal(userId, goalId);
}

export async function removeGoalLink(userId: string, goalId: string, linkId: string) {
  await goalFor(userId, goalId, true);
  const link = await prisma.goalLink.findFirst({ where: { id: linkId, goalId } });
  if (!link) throw new GoalError("Link not found", 404);
  await prisma.goalLink.delete({ where: { id: linkId } });
  return getGoal(userId, goalId);
}

