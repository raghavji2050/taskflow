import type { ProjectRole, WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { broadcastTaskEvent } from "@/lib/realtime";
import { visibleProjectWhere, visibleTaskWhere } from "@/lib/visible-records";
import { getWorkspaceMembership } from "@/lib/workspace";
import {
  DEFAULT_PROJECT_COLOR,
  DEFAULT_PROJECT_DESCRIPTION,
  DEFAULT_PROJECT_NAME,
  DEFAULT_SECTION_NAME,
  ProjectError,
  canCreateProject,
  canEditProjectContent,
  canManageProject,
  canViewProject,
  planSectionReorder,
  planTaskMove,
  validateMemberChange,
  workspaceRoleToProjectRole,
  type ProjectRoleName,
} from "@/lib/project-sections";

const projectMemberInclude = {
  user: { select: { id: true, name: true, email: true } },
} as const;

export async function nextSectionPosition(sectionId: string) {
  const max = await prisma.task.aggregate({
    where: { sectionId },
    _max: { position: true },
  });
  return (max._max.position ?? -1) + 1;
}

export async function ensureDefaultProject(workspaceId: string) {
  const existing = await prisma.project.findFirst({
    where: visibleProjectWhere({ workspaceId, archived: false }),
    orderBy: { createdAt: "asc" },
    include: { sections: { orderBy: { position: "asc" }, take: 1 } },
  });

  if (existing) {
    const section =
      existing.sections[0] ??
      (await prisma.projectSection.create({
        data: { projectId: existing.id, name: DEFAULT_SECTION_NAME, position: 0 },
      }));
    return { project: existing, section };
  }

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    select: { userId: true, role: true },
  });

  const project = await prisma.project.create({
    data: {
      name: DEFAULT_PROJECT_NAME,
      description: DEFAULT_PROJECT_DESCRIPTION,
      color: DEFAULT_PROJECT_COLOR,
      workspaceId,
      members: {
        create: members.map((member) => ({
          userId: member.userId,
          role: workspaceRoleToProjectRole(member.role),
        })),
      },
      sections: { create: { name: DEFAULT_SECTION_NAME, position: 0 } },
    },
    include: { sections: true },
  });

  const section = project.sections[0];
  if (!section) throw new ProjectError("Could not create a default section", 500);
  return { project, section };
}

export async function addUserToDefaultProject(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole
) {
  const { project } = await ensureDefaultProject(workspaceId);
  await prisma.projectMember.upsert({
    where: { userId_projectId: { userId, projectId: project.id } },
    update: {},
    create: { userId, projectId: project.id, role: workspaceRoleToProjectRole(role) },
  });
}

export async function placementForNewTask(input: {
  userId: string;
  workspaceId: string;
  projectId?: string | null;
  sectionId?: string | null;
}) {
  const explicit = Boolean(input.projectId || input.sectionId);
  const placement = await resolveTaskPlacement(input);
  if (!explicit) return placement;

  const access = await requireProjectAccess(input.userId, placement.projectId);
  if (!access.canEdit) {
    throw new ProjectError("You do not have permission to add tasks to this project", 403);
  }
  return placement;
}

export async function projectFieldsForTaskUpdate(input: {
  userId: string;
  workspaceId: string | null;
  currentProjectId: string | null;
  currentSectionId: string | null;
  projectId?: string | null;
  sectionId?: string | null;
}) {
  if (!input.projectId && !input.sectionId) return null;
  if (!input.workspaceId) {
    throw new ProjectError("Personal tasks cannot be added to a project", 400);
  }

  const placement = await resolveTaskPlacement({
    workspaceId: input.workspaceId,
    projectId: input.projectId ?? input.currentProjectId,
    sectionId: input.sectionId ?? input.currentSectionId,
  });
  const access = await requireProjectAccess(input.userId, placement.projectId);
  if (!access.canEdit) {
    throw new ProjectError("You do not have permission to add tasks to this project", 403);
  }

  const samePlace =
    input.currentProjectId === placement.projectId &&
    input.currentSectionId === placement.sectionId;

  return {
    projectId: placement.projectId,
    sectionId: placement.sectionId,
    ...(samePlace ? {} : { position: placement.position }),
  };
}

export async function resolveTaskPlacement(input: {
  workspaceId: string;
  projectId?: string | null;
  sectionId?: string | null;
}) {
  const requestedProjectId = input.projectId ?? null;

  if (input.sectionId) {
    const section = await prisma.projectSection.findUnique({
      where: { id: input.sectionId },
      include: { project: { select: { id: true, workspaceId: true, archived: true, deletedAt: true } } },
    });
    if (!section || section.project.workspaceId !== input.workspaceId || section.project.deletedAt) {
      throw new ProjectError("Section not found in this workspace", 400);
    }
    if (requestedProjectId && requestedProjectId !== section.projectId) {
      throw new ProjectError("Section does not belong to that project", 400);
    }
    if (section.project.archived) {
      throw new ProjectError("Cannot add tasks to an archived project", 400);
    }
    return {
      projectId: section.projectId,
      sectionId: section.id,
      position: await nextSectionPosition(section.id),
    };
  }

  if (requestedProjectId) {
    const project = await prisma.project.findFirst({
      where: visibleProjectWhere({ id: requestedProjectId, workspaceId: input.workspaceId }),
      include: { sections: { orderBy: { position: "asc" }, take: 1 } },
    });
    if (!project) throw new ProjectError("Project not found in this workspace", 400);
    if (project.archived) throw new ProjectError("Cannot add tasks to an archived project", 400);
    const section =
      project.sections[0] ??
      (await prisma.projectSection.create({
        data: { projectId: project.id, name: DEFAULT_SECTION_NAME, position: 0 },
      }));
    return {
      projectId: project.id,
      sectionId: section.id,
      position: await nextSectionPosition(section.id),
    };
  }

  const ensured = await ensureDefaultProject(input.workspaceId);
  return {
    projectId: ensured.project.id,
    sectionId: ensured.section.id,
    position: await nextSectionPosition(ensured.section.id),
  };
}

export async function requireProjectAccess(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { workspace: { select: { id: true, name: true, archivedAt: true } } },
  });
  if (!project || project.workspace.archivedAt || project.deletedAt) {
    throw new ProjectError("Project not found", 404);
  }

  const workspaceMember = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: project.workspaceId } },
  });
  if (!workspaceMember) throw new ProjectError("Project not found", 404);

  const projectMember = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  });

  const roles = {
    workspaceRole: workspaceMember.role,
    projectRole: projectMember?.role ?? null,
  };
  if (!canViewProject(roles)) throw new ProjectError("Forbidden", 403);

  return {
    project,
    workspaceMember,
    projectMember,
    ...roles,
    canEdit: canEditProjectContent(roles) && !project.archived,
    canManage: canManageProject(roles),
  };
}

function accessFor(
  workspaceRole: WorkspaceRole,
  projectRole: ProjectRole | null,
  archived: boolean
) {
  const roles = { workspaceRole, projectRole };
  return {
    role: projectRole,
    canEdit: canEditProjectContent(roles) && !archived,
    canManage: canManageProject(roles),
  };
}

export async function listVisibleProjects(
  userId: string,
  workspaceId: string,
  archived: "true" | "false" | "all"
) {
  const membership = await getWorkspaceMembership(userId, workspaceId);
  if (!membership) throw new ProjectError("Forbidden", 403);

  const seesAll = membership.role === "OWNER" || membership.role === "ADMIN";
  const projects = await prisma.project.findMany({
    where: visibleProjectWhere({
      workspaceId,
      ...(archived === "all" ? {} : { archived: archived === "true" }),
      ...(seesAll ? {} : { members: { some: { userId } } }),
    }),
    include: {
      members: { where: { userId }, select: { role: true } },
      _count: {
        select: {
          members: true,
          sections: true,
          tasks: { where: { archived: false, deletedAt: null } },
        },
      },
    },
    orderBy: [{ archived: "asc" }, { name: "asc" }],
  });

  return projects.map((project) => {
    const { members, ...rest } = project;
    return {
      ...rest,
      ...accessFor(membership.role, members[0]?.role ?? null, project.archived),
    };
  });
}

export async function createProject(input: {
  userId: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  color?: string;
}) {
  const membership = await getWorkspaceMembership(input.userId, input.workspaceId);
  if (!membership) throw new ProjectError("Forbidden", 403);
  if (!canCreateProject(membership.role)) {
    throw new ProjectError("Viewers cannot create projects", 403);
  }

  const project = await prisma.project.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      color: input.color ?? DEFAULT_PROJECT_COLOR,
      workspaceId: input.workspaceId,
      members: { create: { userId: input.userId, role: "OWNER" } },
      sections: { create: { name: DEFAULT_SECTION_NAME, position: 0 } },
    },
    include: {
      _count: { select: { members: true, sections: true, tasks: true } },
    },
  });

  return {
    ...project,
    role: "OWNER" as const,
    canEdit: true,
    canManage: true,
  };
}

export async function getProjectDetail(userId: string, projectId: string) {
  const access = await requireProjectAccess(userId, projectId);
  const [sections, members, tasks] = await Promise.all([
    prisma.projectSection.findMany({
      where: { projectId },
      orderBy: { position: "asc" },
    }),
    prisma.projectMember.findMany({
      where: { projectId },
      include: projectMemberInclude,
      orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
    }),
    prisma.task.findMany({
      where: visibleTaskWhere({ projectId, archived: false }),
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: {
        assignees: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: [{ isPrimary: "desc" }, { assignedAt: "asc" }],
        },
        tags: { include: { tag: true } },
        subtasks: { orderBy: { position: "asc" } },
        user: { select: { id: true, name: true } },
        _count: { select: { comments: true, attachments: true } },
      },
    }),
  ]);

  return {
    project: { ...access.project, sections, members },
    tasks,
    access: {
      canEdit: access.canEdit,
      canManage: access.canManage,
      projectRole: access.projectRole,
      workspaceRole: access.workspaceRole,
    },
  };
}

export async function updateProject(
  userId: string,
  projectId: string,
  data: { name?: string; description?: string | null; color?: string; archived?: boolean }
) {
  const access = await requireProjectAccess(userId, projectId);
  if (!access.canManage) throw new ProjectError("You do not have permission to manage this project", 403);

  return prisma.project.update({
    where: { id: projectId },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.description !== undefined ? { description: data.description?.trim() || null } : {}),
      ...(data.color !== undefined ? { color: data.color } : {}),
      ...(data.archived !== undefined ? { archived: data.archived } : {}),
    },
  });
}

export async function deleteProject(userId: string, projectId: string) {
  const access = await requireProjectAccess(userId, projectId);
  if (!access.canManage) throw new ProjectError("You do not have permission to delete this project", 403);
  await prisma.project.update({
    where: { id: projectId },
    data: { deletedAt: new Date() },
  });
  broadcastTaskEvent({
    type: "task:bulk",
    workspaceId: access.project.workspaceId,
    ownerId: userId,
    actorId: userId,
  });
}

export async function createSection(userId: string, projectId: string, name: string) {
  const access = await requireProjectAccess(userId, projectId);
  if (!access.canEdit) throw new ProjectError("You do not have permission to edit this project", 403);

  const max = await prisma.projectSection.aggregate({
    where: { projectId },
    _max: { position: true },
  });
  return prisma.projectSection.create({
    data: {
      projectId,
      name: name.trim(),
      position: (max._max.position ?? -1) + 1,
    },
  });
}

export async function updateSection(
  userId: string,
  projectId: string,
  sectionId: string,
  name: string
) {
  const access = await requireProjectAccess(userId, projectId);
  if (!access.canEdit) throw new ProjectError("You do not have permission to edit this project", 403);

  const section = await prisma.projectSection.findFirst({ where: { id: sectionId, projectId } });
  if (!section) throw new ProjectError("Section not found", 404);

  return prisma.projectSection.update({
    where: { id: sectionId },
    data: { name: name.trim() },
  });
}

export async function deleteSection(userId: string, projectId: string, sectionId: string) {
  const access = await requireProjectAccess(userId, projectId);
  if (!access.canEdit) throw new ProjectError("You do not have permission to edit this project", 403);

  const sections = await prisma.projectSection.findMany({
    where: { projectId },
    orderBy: { position: "asc" },
  });
  const section = sections.find((item) => item.id === sectionId);
  if (!section) throw new ProjectError("Section not found", 404);
  if (sections.length <= 1) {
    throw new ProjectError("A project must keep at least one section", 400);
  }

  const fallback = sections.find((item) => item.id !== sectionId);
  if (!fallback) throw new ProjectError("A project must keep at least one section", 400);

  const [moving, maxPos] = await Promise.all([
    prisma.task.findMany({
      // Include trashed tasks so they keep a section when this one is removed.
      where: { sectionId },
      orderBy: { position: "asc" },
      select: { id: true },
    }),
    prisma.task.aggregate({
      where: { sectionId: fallback.id },
      _max: { position: true },
    }),
  ]);

  let position = (maxPos._max.position ?? -1) + 1;
  await prisma.$transaction([
    ...moving.map((task) =>
      prisma.task.update({
        where: { id: task.id },
        data: { sectionId: fallback.id, position: position++ },
      })
    ),
    prisma.projectSection.delete({ where: { id: sectionId } }),
  ]);
}

export async function reorderSections(userId: string, projectId: string, sectionIds: string[]) {
  const access = await requireProjectAccess(userId, projectId);
  if (!access.canEdit) throw new ProjectError("You do not have permission to edit this project", 403);

  const sections = await prisma.projectSection.findMany({
    where: { projectId },
    select: { id: true },
  });
  const planned = planSectionReorder(
    sections.map((section) => section.id),
    sectionIds
  );
  await prisma.$transaction(
    planned.map((item) =>
      prisma.projectSection.update({
        where: { id: item.id },
        data: { position: item.position },
      })
    )
  );
}

export async function moveProjectTask(input: {
  userId: string;
  projectId: string;
  taskId: string;
  sectionId: string;
  position: number;
}) {
  const access = await requireProjectAccess(input.userId, input.projectId);
  if (!access.canEdit) throw new ProjectError("You do not have permission to move tasks", 403);

  const section = await prisma.projectSection.findFirst({
    where: { id: input.sectionId, projectId: input.projectId },
    select: { id: true },
  });
  if (!section) throw new ProjectError("Section not found", 404);

  const task = await prisma.task.findFirst({
    where: visibleTaskWhere({ id: input.taskId, projectId: input.projectId }),
    select: { id: true, sectionId: true, position: true, archived: true, userId: true },
  });
  if (!task) throw new ProjectError("Task not found in this project", 404);
  if (task.archived) throw new ProjectError("Archived tasks cannot be moved", 400);

  const sourceId = task.sectionId;
  const rows = await prisma.task.findMany({
    where: visibleTaskWhere({
      projectId: input.projectId,
      archived: false,
      OR: [
        { sectionId: input.sectionId },
        ...(sourceId ? [{ sectionId: sourceId }] : []),
        { id: task.id },
      ],
    }),
    select: { id: true, sectionId: true, position: true },
  });

  const planned = planTaskMove(
    rows.map((row) => ({
      id: row.id,
      sectionId: row.sectionId ?? "__unsectioned__",
      position: row.position,
    })),
    task.id,
    input.sectionId,
    input.position
  ).filter((item) => item.sectionId !== "__unsectioned__");

  await prisma.$transaction(
    planned.map((item) =>
      prisma.task.update({
        where: { id: item.id },
        data: {
          projectId: input.projectId,
          sectionId: item.sectionId,
          position: item.position,
        },
      })
    )
  );

  broadcastTaskEvent({
    type: "task:updated",
    workspaceId: access.project.workspaceId,
    ownerId: task.userId,
    actorId: input.userId,
    taskId: task.id,
  });
}

async function projectMembers(projectId: string) {
  return prisma.projectMember.findMany({
    where: { projectId },
    select: { id: true, userId: true, role: true },
  });
}

export async function addProjectMember(
  actorId: string,
  projectId: string,
  userId: string,
  role: ProjectRoleName
) {
  const access = await requireProjectAccess(actorId, projectId);
  if (!access.canManage) throw new ProjectError("You do not have permission to manage members", 403);

  const workspaceMember = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: access.project.workspaceId } },
  });
  if (!workspaceMember) {
    throw new ProjectError("User is not a member of this workspace", 400);
  }

  const members = await projectMembers(projectId);
  const check = validateMemberChange(members, { type: "add", userId, role });
  if (!check.ok) throw new ProjectError(check.error, 400);

  return prisma.projectMember.create({
    data: { projectId, userId, role },
    include: projectMemberInclude,
  });
}

export async function updateProjectMember(
  actorId: string,
  projectId: string,
  memberId: string,
  role: ProjectRoleName
) {
  const access = await requireProjectAccess(actorId, projectId);
  if (!access.canManage) throw new ProjectError("You do not have permission to manage members", 403);

  const members = await projectMembers(projectId);
  const check = validateMemberChange(members, { type: "update", memberId, role });
  if (!check.ok) throw new ProjectError(check.error, check.error === "Member not found" ? 404 : 400);

  return prisma.projectMember.update({
    where: { id: memberId },
    data: { role },
    include: projectMemberInclude,
  });
}

export async function removeProjectMember(actorId: string, projectId: string, memberId: string) {
  const access = await requireProjectAccess(actorId, projectId);
  if (!access.canManage) throw new ProjectError("You do not have permission to manage members", 403);

  const members = await projectMembers(projectId);
  const check = validateMemberChange(members, { type: "remove", memberId });
  if (!check.ok) throw new ProjectError(check.error, check.error === "Member not found" ? 404 : 400);

  await prisma.projectMember.delete({ where: { id: memberId } });
}
