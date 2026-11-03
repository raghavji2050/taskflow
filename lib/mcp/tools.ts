import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logTaskActivity } from "@/lib/activity";
import { broadcastTaskEvent } from "@/lib/realtime";
import { completedAtForStatusChange } from "@/lib/auto-archive";
import { syncTaskAssignees } from "@/lib/task-assignees";
import { canAccessTask, canEditTask, getUserWorkspaceIds, getWorkspaceMembership, canEditWorkspaceTasks } from "@/lib/workspace";
import { listVisibleProjects, placementForNewTask, requireProjectAccess } from "@/lib/projects";
import { visibleTaskWhere } from "@/lib/visible-records";

export type McpUser = { id: string; name: string };

export class McpToolError extends Error {}

const STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type Status = (typeof STATUSES)[number];
export type PriorityValue = (typeof PRIORITIES)[number];
export { STATUSES, PRIORITIES };

const taskSummarySelect = {
  id: true,
  title: true,
  status: true,
  priority: true,
  dueDate: true,
  workspaceId: true,
  projectId: true,
  project: { select: { name: true } },
  assignees: { select: { user: { select: { id: true, name: true } } } },
} satisfies Prisma.TaskSelect;

type TaskSummaryRow = Prisma.TaskGetPayload<{ select: typeof taskSummarySelect }>;

export function formatTask(t: TaskSummaryRow) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    workspaceId: t.workspaceId,
    projectId: t.projectId,
    project: t.project?.name ?? null,
    assignees: t.assignees.map((a) => ({ id: a.user.id, name: a.user.name })),
  };
}

/** Parses an ISO date/datetime; null clears. Throws on garbage. */
export function parseDue(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(d.getTime())) throw new McpToolError(`Invalid dueDate: ${value}`);
  return d;
}

export async function listProjects(user: McpUser, input: { workspaceId?: string }) {
  const workspaceIds = input.workspaceId ? [input.workspaceId] : await getUserWorkspaceIds(user.id);
  const workspaces = await prisma.workspace.findMany({
    where: { id: { in: workspaceIds }, archivedAt: null },
    select: { id: true, name: true },
  });
  const result = [];
  for (const ws of workspaces) {
    const projects = await listVisibleProjects(user.id, ws.id, "false");
    for (const p of projects) {
      result.push({ id: p.id, name: p.name, workspaceId: ws.id, workspace: ws.name, canEdit: p.canEdit, openTasks: p._count.tasks });
    }
  }
  return { projects: result };
}

export async function listTasks(
  user: McpUser,
  input: {
    projectId?: string;
    workspaceId?: string;
    status?: Status;
    priority?: PriorityValue;
    assignedToMe?: boolean;
    search?: string;
    dueBefore?: string;
    includeCompleted?: boolean;
    limit?: number;
  }
) {
  let where: Prisma.TaskWhereInput;
  if (input.projectId) {
    await requireProjectAccess(user.id, input.projectId);
    where = { projectId: input.projectId };
  } else if (input.workspaceId) {
    if (!(await getWorkspaceMembership(user.id, input.workspaceId))) throw new McpToolError("Workspace not found");
    where = { workspaceId: input.workspaceId };
  } else {
    const wsIds = await getUserWorkspaceIds(user.id);
    where = {
      OR: [
        { userId: user.id, workspaceId: null },
        { assignees: { some: { userId: user.id } } },
        { workspaceId: { in: wsIds }, userId: user.id },
      ],
    };
  }
  where.archived = false;
  const and: Prisma.TaskWhereInput[] = [];
  if (input.status) where.status = input.status;
  else if (!input.includeCompleted) and.push({ status: { not: "COMPLETED" } });
  if (input.priority) where.priority = input.priority;
  if (input.assignedToMe) and.push({ assignees: { some: { userId: user.id } } });
  if (input.search) and.push({ OR: [{ title: { contains: input.search } }, { description: { contains: input.search } }] });
  const dueBefore = parseDue(input.dueBefore);
  if (dueBefore) and.push({ dueDate: { lte: dueBefore } });
  if (and.length) where.AND = and;

  const tasks = await prisma.task.findMany({
    where: visibleTaskWhere(where),
    select: taskSummarySelect,
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: Math.min(Math.max(input.limit ?? 50, 1), 100),
  });
  return { tasks: tasks.map(formatTask) };
}

export async function getTask(user: McpUser, input: { taskId: string }) {
  if (!(await canAccessTask(user.id, input.taskId))) throw new McpToolError("Task not found");
  const task = await prisma.task.findFirst({
    where: visibleTaskWhere({ id: input.taskId }),
    select: {
      ...taskSummarySelect,
      description: true,
      createdAt: true,
      subtasks: { select: { title: true, completed: true } },
      comments: {
        where: { parentId: null },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, body: true, createdAt: true, user: { select: { name: true } } },
      },
    },
  });
  if (!task) throw new McpToolError("Task not found");
  return {
    task: {
      ...formatTask(task),
      description: task.description,
      createdAt: task.createdAt.toISOString(),
      subtasks: task.subtasks,
      comments: task.comments.map((c) => ({ id: c.id, author: c.user.name, body: c.body, createdAt: c.createdAt.toISOString() })),
    },
  };
}

async function assertAssignable(workspaceId: string | null, assigneeId: string) {
  if (!workspaceId) throw new McpToolError("Assignees are only supported on workspace tasks");
  const member = await getWorkspaceMembership(assigneeId, workspaceId);
  if (!member) throw new McpToolError("Assignee is not a member of this workspace");
}

export async function createTask(
  user: McpUser,
  input: {
    title: string;
    description?: string;
    projectId?: string;
    workspaceId?: string;
    priority?: PriorityValue;
    status?: Status;
    dueDate?: string;
    assigneeId?: string;
  }
) {
  let workspaceId = input.workspaceId ?? null;
  if (input.projectId) {
    const access = await requireProjectAccess(user.id, input.projectId);
    if (!access.canEdit) throw new McpToolError("You cannot add tasks to this project");
    workspaceId = access.project.workspaceId;
  }
  let projectId: string | null = null;
  let sectionId: string | null = null;
  let position: number;
  if (workspaceId) {
    const membership = await getWorkspaceMembership(user.id, workspaceId);
    if (!membership) throw new McpToolError("Workspace not found");
    if (!canEditWorkspaceTasks(membership)) throw new McpToolError("Viewers cannot create tasks");
    const placement = await placementForNewTask({ userId: user.id, workspaceId, projectId: input.projectId });
    projectId = placement.projectId;
    sectionId = placement.sectionId;
    position = placement.position;
  } else {
    const maxPos = await prisma.task.aggregate({
      where: visibleTaskWhere({ userId: user.id, workspaceId: null }),
      _max: { position: true },
    });
    position = (maxPos._max.position ?? 0) + 1;
  }
  if (input.assigneeId) await assertAssignable(workspaceId, input.assigneeId);
  const status = input.status ?? "PENDING";
  const task = await prisma.task.create({
    data: {
      title: input.title,
      description: input.description || null,
      priority: input.priority ?? "MEDIUM",
      status,
      completedAt: status === "COMPLETED" ? new Date() : null,
      dueDate: parseDue(input.dueDate) ?? null,
      workspaceId,
      projectId,
      sectionId,
      position,
      userId: user.id,
    },
  });
  if (workspaceId && input.assigneeId) {
    await syncTaskAssignees({
      taskId: task.id,
      workspaceId,
      assigneeIds: [input.assigneeId],
      primaryAssigneeId: input.assigneeId,
      actorId: user.id,
      actorName: user.name,
      taskTitle: task.title,
    });
  }
  await logTaskActivity(task.id, "created", `Task "${task.title}" created via MCP`);
  broadcastTaskEvent({ type: "task:created", workspaceId, ownerId: user.id, actorId: user.id, taskId: task.id });
  return getTask(user, { taskId: task.id });
}

export async function updateTask(
  user: McpUser,
  input: {
    taskId: string;
    title?: string;
    status?: Status;
    priority?: PriorityValue;
    dueDate?: string | null;
    assigneeId?: string | null;
  }
) {
  const existing = await canAccessTask(user.id, input.taskId);
  if (!existing) throw new McpToolError("Task not found");
  if (!(await canEditTask(user.id, input.taskId))) throw new McpToolError("You do not have permission to edit this task");

  const data: Prisma.TaskUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.priority) data.priority = input.priority;
  const due = parseDue(input.dueDate);
  if (due !== undefined) data.dueDate = due;
  if (input.status) {
    data.status = input.status;
    const completedAt = completedAtForStatusChange(input.status, existing.status);
    if (completedAt !== undefined) data.completedAt = completedAt;
  }
  if (input.assigneeId) await assertAssignable(existing.workspaceId, input.assigneeId);

  await prisma.task.update({ where: { id: input.taskId }, data });
  if (input.assigneeId !== undefined && existing.workspaceId) {
    await syncTaskAssignees({
      taskId: input.taskId,
      workspaceId: existing.workspaceId,
      assigneeIds: input.assigneeId ? [input.assigneeId] : [],
      primaryAssigneeId: input.assigneeId,
      actorId: user.id,
      actorName: user.name,
      taskTitle: input.title ?? existing.title,
    });
  }
  const changed = Object.keys(input).filter((k) => k !== "taskId" && input[k as keyof typeof input] !== undefined);
  await logTaskActivity(input.taskId, "updated", `Updated via MCP: ${changed.join(", ") || "nothing"}`);
  broadcastTaskEvent({ type: "task:updated", workspaceId: existing.workspaceId, ownerId: existing.userId, actorId: user.id, taskId: input.taskId });
  return getTask(user, { taskId: input.taskId });
}

export async function addComment(user: McpUser, input: { taskId: string; body: string }) {
  const task = await canAccessTask(user.id, input.taskId);
  if (!task) throw new McpToolError("Task not found");
  if (!(await canEditTask(user.id, input.taskId))) throw new McpToolError("Viewers cannot comment");
  const comment = await prisma.comment.create({
    data: { body: input.body, taskId: input.taskId, userId: user.id },
    select: { id: true, body: true, createdAt: true },
  });
  await logTaskActivity(input.taskId, "commented", `${user.name} commented via MCP`);
  broadcastTaskEvent({ type: "task:updated", workspaceId: task.workspaceId, ownerId: task.userId, actorId: user.id, taskId: input.taskId });
  return { comment: { ...comment, createdAt: comment.createdAt.toISOString() } };
}
