import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logTaskActivity } from "@/lib/activity";
import { broadcastTaskEvent } from "@/lib/realtime";
import { syncTaskAssignees } from "@/lib/task-assignees";
import { canAccessTask, canEditTask, getUserWorkspaceIds, getWorkspaceMembership, getWorkspaceMembers } from "@/lib/workspace";
import { createProject as libCreateProject, createSection as libCreateSection, projectFieldsForTaskUpdate, requireProjectAccess, updateProject as libUpdateProject } from "@/lib/projects";
import { listPersonalTrash, listWorkspaceTrash, restoreTrashItem } from "@/lib/trash";
import { visibleTaskWhere } from "@/lib/visible-records";
import { formatTask, McpToolError, type McpUser } from "@/lib/mcp/tools";

export const RECURRENCES = ["DAILY", "WEEKLY", "MONTHLY"] as const;

const summary = {
  id: true, title: true, status: true, priority: true, dueDate: true, workspaceId: true, projectId: true,
  project: { select: { name: true } },
  assignees: { select: { user: { select: { id: true, name: true } } } },
} satisfies Prisma.TaskSelect;

async function requireTaskEdit(user: McpUser, taskId: string) {
  const task = await canAccessTask(user.id, taskId);
  if (!task) throw new McpToolError("Task not found");
  if (!(await canEditTask(user.id, taskId))) throw new McpToolError("You do not have permission to edit this task");
  return task;
}

async function requireTaskRead(user: McpUser, taskId: string) {
  const task = await canAccessTask(user.id, taskId);
  if (!task) throw new McpToolError("Task not found");
  return task;
}

function touched(user: McpUser, task: { id: string; workspaceId: string | null; userId: string }, type: "task:updated" | "task:deleted" = "task:updated") {
  broadcastTaskEvent({ type, workspaceId: task.workspaceId, ownerId: task.userId, actorId: user.id, taskId: task.id });
}

// ---- workspaces & members
export async function listWorkspaces(user: McpUser, input: { includeArchived?: boolean } = {}) {
  const rows = await prisma.workspaceMember.findMany({
    where: { userId: user.id, ...(input.includeArchived ? {} : { workspace: { archivedAt: null } }) },
    select: { role: true, workspace: { select: { id: true, name: true, archivedAt: true } } },
  });
  return { workspaces: rows.map((r) => ({ id: r.workspace.id, name: r.workspace.name, role: r.role, archived: !!r.workspace.archivedAt })) };
}

export async function listWorkspaceMembers(user: McpUser, input: { workspaceId: string }) {
  if (!(await getWorkspaceMembership(user.id, input.workspaceId))) throw new McpToolError("Workspace not found");
  const members = await getWorkspaceMembers(input.workspaceId);
  return { members: members.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email, role: m.role })) };
}

export async function assignTask(user: McpUser, input: { taskId: string; assigneeIds: string[] }) {
  const task = await requireTaskEdit(user, input.taskId);
  if (!task.workspaceId) throw new McpToolError("Assignees are only supported on workspace tasks");
  for (const id of input.assigneeIds) {
    if (!(await getWorkspaceMembership(id, task.workspaceId))) throw new McpToolError(`User ${id} is not a member of this workspace`);
  }
  await syncTaskAssignees({
    taskId: task.id, workspaceId: task.workspaceId, assigneeIds: input.assigneeIds,
    primaryAssigneeId: input.assigneeIds[0] ?? null, actorId: user.id, actorName: user.name, taskTitle: task.title,
  });
  await logTaskActivity(task.id, "updated", "Assignees updated via MCP");
  touched(user, task);
  return { ok: true, taskId: task.id, assigneeIds: input.assigneeIds };
}

// ---- projects & sections
export async function createProject(user: McpUser, input: { workspaceId: string; name: string; description?: string; color?: string }) {
  const p = await libCreateProject({ userId: user.id, ...input });
  return { project: { id: p.id, name: p.name, workspaceId: p.workspaceId } };
}

export async function updateProject(user: McpUser, input: { projectId: string; name?: string; description?: string | null; color?: string; archived?: boolean }) {
  const { projectId, ...data } = input;
  const p = await libUpdateProject(user.id, projectId, data);
  return { project: { id: p.id, name: p.name, archived: p.archived } };
}

export async function listSections(user: McpUser, input: { projectId: string }) {
  await requireProjectAccess(user.id, input.projectId);
  const sections = await prisma.projectSection.findMany({
    where: { projectId: input.projectId }, orderBy: { position: "asc" }, select: { id: true, name: true, position: true },
  });
  return { sections };
}

export async function createSection(user: McpUser, input: { projectId: string; name: string }) {
  const s = await libCreateSection(user.id, input.projectId, input.name);
  return { section: { id: s.id, name: s.name, position: s.position } };
}

export async function moveTask(user: McpUser, input: { taskId: string; projectId?: string; sectionId?: string }) {
  if (!input.projectId && !input.sectionId) throw new McpToolError("Pass projectId and/or sectionId");
  const task = await requireTaskEdit(user, input.taskId);
  const current = await prisma.task.findUnique({ where: { id: task.id }, select: { projectId: true, sectionId: true } });
  const fields = await projectFieldsForTaskUpdate({
    userId: user.id, workspaceId: task.workspaceId, currentProjectId: current?.projectId ?? null,
    currentSectionId: current?.sectionId ?? null, projectId: input.projectId, sectionId: input.sectionId,
  });
  if (fields) await prisma.task.update({ where: { id: task.id }, data: fields });
  await logTaskActivity(task.id, "updated", "Moved via MCP");
  touched(user, task);
  return { ok: true, taskId: task.id, ...fields };
}

// ---- delete / trash
export async function deleteTask(user: McpUser, input: { taskId: string }) {
  const task = await requireTaskEdit(user, input.taskId);
  await prisma.task.update({ where: { id: task.id }, data: { deletedAt: new Date() } });
  touched(user, task, "task:deleted");
  return { ok: true, taskId: task.id, note: "Moved to trash. Use restore_from_trash to undo." };
}

export async function listTrash(user: McpUser, input: { workspaceId?: string }) {
  const items = input.workspaceId ? await listWorkspaceTrash(user.id, input.workspaceId) : await listPersonalTrash(user.id);
  return { items };
}

export async function restoreFromTrash(user: McpUser, input: { kind: "task" | "project"; id: string; workspaceId?: string }) {
  await restoreTrashItem({ userId: user.id, workspaceId: input.workspaceId ?? null, kind: input.kind, id: input.id });
  return { ok: true, restored: input };
}

// ---- subtasks
export async function listSubtasks(user: McpUser, input: { taskId: string }) {
  await requireTaskRead(user, input.taskId);
  const subtasks = await prisma.subtask.findMany({ where: { taskId: input.taskId }, orderBy: { position: "asc" }, select: { id: true, title: true, completed: true } });
  return { subtasks };
}

export async function createSubtask(user: McpUser, input: { taskId: string; title: string }) {
  const task = await requireTaskEdit(user, input.taskId);
  const max = await prisma.subtask.aggregate({ where: { taskId: task.id }, _max: { position: true } });
  const s = await prisma.subtask.create({
    data: { title: input.title, taskId: task.id, position: (max._max.position ?? 0) + 1 },
    select: { id: true, title: true, completed: true },
  });
  touched(user, task);
  return { subtask: s };
}

export async function updateSubtask(user: McpUser, input: { subtaskId: string; title?: string; completed?: boolean }) {
  const sub = await prisma.subtask.findUnique({ where: { id: input.subtaskId }, select: { taskId: true } });
  if (!sub) throw new McpToolError("Subtask not found");
  const task = await requireTaskEdit(user, sub.taskId);
  const s = await prisma.subtask.update({
    where: { id: input.subtaskId },
    data: { ...(input.title !== undefined ? { title: input.title } : {}), ...(input.completed !== undefined ? { completed: input.completed } : {}) },
    select: { id: true, title: true, completed: true },
  });
  touched(user, task);
  return { subtask: s };
}

// ---- comments
export async function listComments(user: McpUser, input: { taskId: string; limit?: number }) {
  await requireTaskRead(user, input.taskId);
  const comments = await prisma.comment.findMany({
    where: { taskId: input.taskId }, orderBy: { createdAt: "desc" }, take: Math.min(input.limit ?? 50, 100),
    select: { id: true, body: true, parentId: true, createdAt: true, user: { select: { id: true, name: true } } },
  });
  return { comments: comments.map((c) => ({ id: c.id, parentId: c.parentId, author: c.user.name, body: c.body, createdAt: c.createdAt.toISOString() })) };
}

// ---- search
export async function searchTasks(user: McpUser, input: { query: string; includeCompleted?: boolean; limit?: number }) {
  const wsIds = await getUserWorkspaceIds(user.id);
  const and: Prisma.TaskWhereInput[] = [
    { OR: [{ userId: user.id, workspaceId: null }, { workspaceId: { in: wsIds } }, { assignees: { some: { userId: user.id } } }] },
    { OR: [{ title: { contains: input.query } }, { description: { contains: input.query } }] },
  ];
  if (!input.includeCompleted) and.push({ status: { not: "COMPLETED" } });
  const rows = await prisma.task.findMany({
    where: visibleTaskWhere({ archived: false, AND: and }), select: summary,
    orderBy: { updatedAt: "desc" }, take: Math.min(input.limit ?? 25, 50) * 2,
  });
  const out = [];
  for (const r of rows) {
    if (await canAccessTask(user.id, r.id)) out.push(formatTask(r)); // respects private projects
    if (out.length >= Math.min(input.limit ?? 25, 50)) break;
  }
  return { tasks: out };
}

// ---- tags (personal labels)
export async function listTags(user: McpUser) {
  const tags = await prisma.tag.findMany({ where: { userId: user.id }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return { tags };
}

export async function setTaskTags(user: McpUser, input: { taskId: string; tags: string[] }) {
  const task = await requireTaskEdit(user, input.taskId);
  const names = [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))].slice(0, 20);
  const tags = [];
  for (const name of names) {
    tags.push(await prisma.tag.upsert({ where: { userId_name: { userId: user.id, name } }, create: { userId: user.id, name }, update: {}, select: { id: true, name: true } }));
  }
  // Only replace this user's own tags on the task.
  await prisma.taskTag.deleteMany({ where: { taskId: task.id, tag: { userId: user.id } } });
  if (tags.length) await prisma.taskTag.createMany({ data: tags.map((t) => ({ taskId: task.id, tagId: t.id })), skipDuplicates: true });
  touched(user, task);
  return { taskId: task.id, tags };
}

// ---- recurrence
export async function setRecurrence(user: McpUser, input: { taskId: string; rule: (typeof RECURRENCES)[number] | null }) {
  const task = await requireTaskEdit(user, input.taskId);
  await prisma.task.update({ where: { id: task.id }, data: { recurrenceRule: input.rule } });
  touched(user, task);
  return { taskId: task.id, recurrenceRule: input.rule };
}

// ---- notifications
const notifSelect = { id: true, title: true, body: true, read: true, type: true, createdAt: true, messageId: true, conversationId: true } as const;
type NotifRow = { id: string; title: string; body: string; read: boolean; type: string; createdAt: Date; messageId: string | null; conversationId: string | null };

/** Chat notifications store an 80-char preview; resolve the full message body when the user can still see it. */
async function withFullBody(userId: string, rows: NotifRow[]) {
  const ids = [...new Set(rows.map((r) => r.messageId).filter((v): v is string => !!v))];
  const messages = ids.length
    ? await prisma.message.findMany({
        where: { id: { in: ids }, deletedAt: null, conversation: { participants: { some: { userId } } } },
        select: { id: true, body: true },
      })
    : [];
  const full = new Map(messages.map((m) => [m.id, m.body]));
  return rows.map(({ messageId, ...n }) => {
    const body = (messageId && full.get(messageId)) || n.body;
    return { ...n, body, preview: n.body, truncated: body !== n.body, messageId, createdAt: n.createdAt.toISOString() };
  });
}

export async function listNotifications(user: McpUser, input: { unreadOnly?: boolean; limit?: number }) {
  const where = { userId: user.id, archivedAt: null, ...(input.unreadOnly ? { read: false } : {}) };
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: Math.min(input.limit ?? 30, 100), select: notifSelect }),
    prisma.notification.count({ where: { userId: user.id, archivedAt: null, read: false } }),
  ]);
  return { unreadCount, notifications: await withFullBody(user.id, notifications) };
}

export async function getNotification(user: McpUser, input: { id: string }) {
  const n = await prisma.notification.findFirst({ where: { id: input.id, userId: user.id }, select: notifSelect });
  if (!n) throw new McpToolError("Notification not found");
  const [row] = await withFullBody(user.id, [n]);
  return { notification: row };
}

/** Who the token belongs to plus data counts, so a client can verify account mapping. */
export async function whoami(user: McpUser) {
  const [u, workspaces, archivedWorkspaces, personalTasks, assignedTasks, notifications] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { id: true, name: true, email: true } }),
    prisma.workspaceMember.count({ where: { userId: user.id, workspace: { archivedAt: null } } }),
    prisma.workspaceMember.count({ where: { userId: user.id, workspace: { archivedAt: { not: null } } } }),
    prisma.task.count({ where: visibleTaskWhere({ userId: user.id, workspaceId: null, archived: false }) }),
    prisma.task.count({ where: visibleTaskWhere({ assignees: { some: { userId: user.id } }, archived: false }) }),
    prisma.notification.count({ where: { userId: user.id, archivedAt: null } }),
  ]);
  return { user: u, counts: { workspaces, archivedWorkspaces, personalTasks, assignedTasks, notifications } };
}

export async function markNotificationsRead(user: McpUser, input: { ids?: string[]; all?: boolean }) {
  if (!input.all && !input.ids?.length) throw new McpToolError("Pass ids or all=true");
  const res = await prisma.notification.updateMany({
    where: { userId: user.id, read: false, ...(input.all ? {} : { id: { in: input.ids } }) }, data: { read: true },
  });
  return { marked: res.count };
}
