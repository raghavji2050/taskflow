import { Prisma, type WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  canManageProject,
  type ProjectAccessRoles,
} from "@/lib/project-sections";
import { broadcastTaskEvent } from "@/lib/realtime";
import {
  TRASH_PURGE_BATCH_SIZE,
  TRASH_PURGE_MAX_BATCHES,
  expiredDeletedAtWhere,
  selectExpiredTrashIds,
  taskIdsInProjects,
} from "@/lib/trash-purge";
import { trashPurgeCutoff } from "@/lib/trash-policy";
import { getWorkspaceMembership } from "@/lib/workspace";
import { canEditWorkspaceTasks } from "@/lib/workspace-permissions";

export class TrashError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TrashError";
    this.status = status;
  }
}

export type TrashKind = "task" | "project";

export type TrashItem = {
  kind: TrashKind;
  id: string;
  title: string;
  deletedAt: string;
  detail: string | null;
  canRestore: boolean;
  canPurge: boolean;
};

/** Personal tasks pass a null role. Workspace viewers cannot change Trash. */
export function trashedTaskActions(role: WorkspaceRole | null) {
  const allowed = role === null || canEditWorkspaceTasks({ role, canInviteMembers: false });
  return { canRestore: allowed, canPurge: allowed };
}

/** Project trash follows the same manage permission as deleting a project. */
export function trashedProjectActions(access: ProjectAccessRoles) {
  const allowed = canManageProject(access);
  return { canRestore: allowed, canPurge: allowed };
}

export async function listPersonalTrash(userId: string): Promise<TrashItem[]> {
  const tasks = await prisma.task.findMany({
    where: { userId, workspaceId: null, deletedAt: { not: null } },
    select: { id: true, title: true, deletedAt: true },
    orderBy: { deletedAt: "desc" },
  });
  const actions = trashedTaskActions(null);
  return tasks.flatMap((task) => {
    if (!task.deletedAt) return [];
    return [{
      kind: "task" as const,
      id: task.id,
      title: task.title,
      deletedAt: task.deletedAt.toISOString(),
      detail: null,
      ...actions,
    }];
  });
}

export async function listWorkspaceTrash(userId: string, workspaceId: string): Promise<TrashItem[]> {
  const membership = await getWorkspaceMembership(userId, workspaceId);
  if (!membership) throw new TrashError("Forbidden", 403);

  const seesAll = membership.role === "OWNER" || membership.role === "ADMIN";
  const taskActions = trashedTaskActions(membership.role);

  const [projects, tasks] = await Promise.all([
    prisma.project.findMany({
      where: {
        workspaceId,
        deletedAt: { not: null },
        ...(seesAll ? {} : { members: { some: { userId } } }),
      },
      include: {
        members: { where: { userId }, select: { role: true } },
        _count: { select: { tasks: { where: { deletedAt: null } } } },
      },
      orderBy: { deletedAt: "desc" },
    }),
    prisma.task.findMany({
      where: {
        workspaceId,
        deletedAt: { not: null },
        OR: [{ projectId: null }, { project: { is: { deletedAt: null } } }],
      },
      select: {
        id: true,
        title: true,
        deletedAt: true,
        project: { select: { name: true } },
      },
      orderBy: { deletedAt: "desc" },
    }),
  ]);

  const projectItems: TrashItem[] = projects.map((project) => {
    const hidden = project._count.tasks;
    return {
      kind: "project",
      id: project.id,
      title: project.name,
      deletedAt: project.deletedAt!.toISOString(),
      detail: hidden === 1 ? "1 task hidden" : `${hidden} tasks hidden`,
      ...trashedProjectActions({
        workspaceRole: membership.role,
        projectRole: project.members[0]?.role ?? null,
      }),
    };
  });

  const taskItems: TrashItem[] = tasks.flatMap((task) => {
    if (!task.deletedAt) return [];
    return [{
      kind: "task" as const,
      id: task.id,
      title: task.title,
      deletedAt: task.deletedAt.toISOString(),
      detail: task.project?.name ?? null,
      ...taskActions,
    }];
  });

  return [...projectItems, ...taskItems].sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));
}

export async function restoreTrashItem(input: {
  userId: string;
  workspaceId: string | null;
  kind: TrashKind;
  id: string;
}) {
  if (!input.workspaceId) {
    if (input.kind !== "task") throw new TrashError("Personal trash only contains tasks", 400);
    await restorePersonalTask(input.userId, input.id);
    return;
  }
  if (input.kind === "project") {
    await restoreWorkspaceProject(input.userId, input.workspaceId, input.id);
    return;
  }
  await restoreWorkspaceTask(input.userId, input.workspaceId, input.id);
}

export async function purgeTrashItem(input: {
  userId: string;
  workspaceId: string | null;
  kind: TrashKind;
  id: string;
}) {
  if (!input.workspaceId) {
    if (input.kind !== "task") throw new TrashError("Personal trash only contains tasks", 400);
    await purgePersonalTask(input.userId, input.id);
    return;
  }
  if (input.kind === "project") {
    await purgeWorkspaceProject(input.userId, input.workspaceId, input.id);
    return;
  }
  await purgeWorkspaceTask(input.userId, input.workspaceId, input.id);
}

export async function purgeExpiredTrash(now = new Date()) {
  const cutoff = trashPurgeCutoff(now);
  let tasksPurged = 0;
  let projectsPurged = 0;

  for (let batch = 0; batch < TRASH_PURGE_MAX_BATCHES; batch++) {
    const candidates = await prisma.project.findMany({
      where: { deletedAt: expiredDeletedAtWhere(cutoff) },
      select: { id: true, deletedAt: true },
      orderBy: [{ deletedAt: "asc" }, { id: "asc" }],
      take: TRASH_PURGE_BATCH_SIZE,
    });
    const projectIds = selectExpiredTrashIds(candidates, cutoff);
    if (projectIds.length === 0) break;

    const removed = await deleteExpiredProjectBatch(projectIds, cutoff);
    tasksPurged += removed.tasks;
    projectsPurged += removed.projects;
    if (removed.tasks === 0 && removed.projects === 0) break;
    if (removed.projects === projectIds.length && projectIds.length < TRASH_PURGE_BATCH_SIZE) {
      break;
    }
  }

  for (let batch = 0; batch < TRASH_PURGE_MAX_BATCHES; batch++) {
    const candidates = await prisma.task.findMany({
      where: { deletedAt: expiredDeletedAtWhere(cutoff) },
      select: { id: true, deletedAt: true },
      orderBy: [{ deletedAt: "asc" }, { id: "asc" }],
      take: TRASH_PURGE_BATCH_SIZE,
    });
    const taskIds = selectExpiredTrashIds(candidates, cutoff);
    if (taskIds.length === 0) break;

    const removed = await deleteExpiredTaskBatch(taskIds, cutoff);
    tasksPurged += removed;
    if (removed === 0) break;
    if (taskIds.length < TRASH_PURGE_BATCH_SIZE) break;
  }

  const [projectsLeft, tasksLeft] = await Promise.all([
    prisma.project.count({ where: { deletedAt: expiredDeletedAtWhere(cutoff) } }),
    prisma.task.count({ where: { deletedAt: expiredDeletedAtWhere(cutoff) } }),
  ]);

  return {
    tasksPurged,
    projectsPurged,
    cutoff: cutoff.toISOString(),
    truncated: projectsLeft > 0 || tasksLeft > 0,
  };
}

/**
 * Hard-delete one batch of expired projects and the tasks that reference them.
 * Child task rows (comments, reminders, time entries, and the rest) cascade.
 * Projects stay until their tasks are gone, because Task.projectId is SET NULL.
 */
async function deleteExpiredProjectBatch(candidateIds: string[], cutoff: Date) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM Project
      WHERE id IN (${Prisma.join(candidateIds)})
        AND deletedAt IS NOT NULL
        AND deletedAt < ${cutoff}
      FOR UPDATE
    `;
    const projectIds = locked.map((project) => project.id);
    if (projectIds.length === 0) return { tasks: 0, projects: 0 };

    const taskRows = await tx.task.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true, projectId: true },
      orderBy: { id: "asc" },
      take: TRASH_PURGE_BATCH_SIZE,
    });
    const taskIds = taskIdsInProjects(taskRows, projectIds);
    let tasks = 0;
    if (taskIds.length > 0) {
      const removedTasks = await tx.task.deleteMany({
        where: { id: { in: taskIds } },
      });
      tasks = removedTasks.count;
    }

    const remainingTasks = await tx.task.count({
      where: { projectId: { in: projectIds } },
    });
    if (remainingTasks > 0) return { tasks, projects: 0 };

    const removedProjects = await tx.project.deleteMany({
      where: { id: { in: projectIds } },
    });
    return { tasks, projects: removedProjects.count };
  });
}

async function deleteExpiredTaskBatch(candidateIds: string[], cutoff: Date) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM Task
      WHERE id IN (${Prisma.join(candidateIds)})
        AND deletedAt IS NOT NULL
        AND deletedAt < ${cutoff}
      FOR UPDATE
    `;
    if (locked.length === 0) return 0;
    const removed = await tx.task.deleteMany({
      where: { id: { in: locked.map((task) => task.id) } },
    });
    return removed.count;
  });
}

async function restorePersonalTask(userId: string, taskId: string) {
  const updated = await prisma.task.updateMany({
    where: { id: taskId, userId, workspaceId: null, deletedAt: { not: null } },
    data: { deletedAt: null },
  });
  if (updated.count === 0) throw new TrashError("Task not found", 404);
  broadcastTaskEvent({
    type: "task:updated",
    workspaceId: null,
    ownerId: userId,
    actorId: userId,
    taskId,
  });
}

async function restoreWorkspaceTask(userId: string, workspaceId: string, taskId: string) {
  const membership = await requireWorkspaceMember(userId, workspaceId);
  if (!trashedTaskActions(membership.role).canRestore) {
    throw new TrashError("You do not have permission to restore this task", 403);
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId, deletedAt: { not: null } },
    select: { id: true, userId: true, project: { select: { deletedAt: true } } },
  });
  if (!task) throw new TrashError("Task not found", 404);
  if (task.project?.deletedAt) {
    throw new TrashError("Restore the project before restoring this task", 400);
  }

  await prisma.task.update({ where: { id: taskId }, data: { deletedAt: null } });
  broadcastTaskEvent({
    type: "task:updated",
    workspaceId,
    ownerId: task.userId,
    actorId: userId,
    taskId,
  });
}

async function restoreWorkspaceProject(userId: string, workspaceId: string, projectId: string) {
  const project = await loadTrashedProject(userId, workspaceId, projectId, "restore");
  await prisma.project.update({ where: { id: project.id }, data: { deletedAt: null } });
  broadcastTaskEvent({
    type: "task:bulk",
    workspaceId,
    ownerId: userId,
    actorId: userId,
  });
}

async function purgePersonalTask(userId: string, taskId: string) {
  const removed = await prisma.task.deleteMany({
    where: { id: taskId, userId, workspaceId: null, deletedAt: { not: null } },
  });
  if (removed.count === 0) throw new TrashError("Task not found", 404);
  broadcastTaskEvent({
    type: "task:deleted",
    workspaceId: null,
    ownerId: userId,
    actorId: userId,
    taskId,
  });
}

async function purgeWorkspaceTask(userId: string, workspaceId: string, taskId: string) {
  const membership = await requireWorkspaceMember(userId, workspaceId);
  if (!trashedTaskActions(membership.role).canPurge) {
    throw new TrashError("You do not have permission to permanently delete this task", 403);
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId, deletedAt: { not: null } },
    select: { id: true, userId: true },
  });
  if (!task) throw new TrashError("Task not found", 404);

  await prisma.task.delete({ where: { id: taskId } });
  broadcastTaskEvent({
    type: "task:deleted",
    workspaceId,
    ownerId: task.userId,
    actorId: userId,
    taskId,
  });
}

async function purgeWorkspaceProject(userId: string, workspaceId: string, projectId: string) {
  await loadTrashedProject(userId, workspaceId, projectId, "purge");
  await prisma.$transaction(async (tx) => {
    const existing = await tx.project.findFirst({
      where: { id: projectId, workspaceId, deletedAt: { not: null } },
      select: { id: true },
    });
    if (!existing) throw new TrashError("Project not found", 404);
    await tx.task.deleteMany({ where: { projectId } });
    await tx.project.delete({ where: { id: projectId } });
  });
  broadcastTaskEvent({
    type: "task:bulk",
    workspaceId,
    ownerId: userId,
    actorId: userId,
  });
}

async function requireWorkspaceMember(userId: string, workspaceId: string) {
  const membership = await getWorkspaceMembership(userId, workspaceId);
  if (!membership) throw new TrashError("Forbidden", 403);
  return membership;
}

async function loadTrashedProject(
  userId: string,
  workspaceId: string,
  projectId: string,
  action: "restore" | "purge"
) {
  const membership = await requireWorkspaceMember(userId, workspaceId);
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId, deletedAt: { not: null } },
    include: { members: { where: { userId }, select: { role: true } } },
  });
  if (!project) throw new TrashError("Project not found", 404);

  const seesAll = membership.role === "OWNER" || membership.role === "ADMIN";
  if (!seesAll && project.members.length === 0) {
    throw new TrashError("Project not found", 404);
  }

  const actions = trashedProjectActions({
    workspaceRole: membership.role,
    projectRole: project.members[0]?.role ?? null,
  });
  const allowed = action === "restore" ? actions.canRestore : actions.canPurge;
  if (!allowed) {
    const verb = action === "restore" ? "restore" : "permanently delete";
    throw new TrashError(`You do not have permission to ${verb} this project`, 403);
  }
  return project;
}
