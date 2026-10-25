export const DEFAULT_PROJECT_NAME = "General";
export const DEFAULT_PROJECT_DESCRIPTION = "Default project for existing tasks";
export const DEFAULT_PROJECT_COLOR = "#6366f1";
export const DEFAULT_SECTION_NAME = "To do";

export const PROJECT_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#0ea5e9",
  "#ef4444",
] as const;

export const PROJECT_ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;
export type ProjectRoleName = (typeof PROJECT_ROLES)[number];
export type WorkspaceRoleName = ProjectRoleName;

export class ProjectError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ProjectError";
    this.status = status;
  }
}

export type ProjectAccessRoles = {
  workspaceRole: WorkspaceRoleName | null;
  projectRole: ProjectRoleName | null;
};

export function workspaceRoleToProjectRole(role: WorkspaceRoleName): ProjectRoleName {
  return role;
}

export function canCreateProject(workspaceRole: WorkspaceRoleName | null | undefined): boolean {
  return !!workspaceRole && workspaceRole !== "VIEWER";
}

export function canViewProject(access: ProjectAccessRoles): boolean {
  if (!access.workspaceRole) return false;
  if (access.workspaceRole === "OWNER" || access.workspaceRole === "ADMIN") return true;
  return access.projectRole != null;
}

export function canEditProjectContent(access: ProjectAccessRoles): boolean {
  if (!canViewProject(access)) return false;
  if (access.workspaceRole === "OWNER" || access.workspaceRole === "ADMIN") return true;
  return access.projectRole != null && access.projectRole !== "VIEWER";
}

export function canManageProject(access: ProjectAccessRoles): boolean {
  if (!access.workspaceRole) return false;
  if (access.workspaceRole === "OWNER" || access.workspaceRole === "ADMIN") return true;
  return access.projectRole === "OWNER" || access.projectRole === "ADMIN";
}

export type SectionTask = {
  id: string;
  sectionId: string;
  position: number;
};

function sortSectionTasks(tasks: SectionTask[]) {
  return [...tasks].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

/** Plan the positions after moving a task to `toIndex` in `toSectionId`. */
export function planTaskMove(
  tasks: SectionTask[],
  taskId: string,
  toSectionId: string,
  toIndex: number
): SectionTask[] {
  const moving = tasks.find((task) => task.id === taskId);
  if (!moving) throw new ProjectError("Task is not in this project", 404);
  if (!toSectionId) throw new ProjectError("Section is required", 400);

  const sourceId = moving.sectionId;
  const remaining = tasks.filter((task) => task.id !== taskId);
  const target = sortSectionTasks(remaining.filter((task) => task.sectionId === toSectionId));
  const index = Math.max(0, Math.min(Math.trunc(toIndex), target.length));
  target.splice(index, 0, { ...moving, sectionId: toSectionId, position: index });

  const affected = new Set([sourceId, toSectionId]);
  const planned: SectionTask[] = [];

  for (const sectionId of affected) {
    const list = sectionId === toSectionId
      ? target
      : sortSectionTasks(remaining.filter((task) => task.sectionId === sectionId));
    list.forEach((task, position) => {
      planned.push({ id: task.id, sectionId, position });
    });
  }

  return planned;
}

export function planSectionReorder(sectionIds: string[], orderedIds: string[]) {
  if (orderedIds.length !== sectionIds.length) {
    throw new ProjectError("Section order must include every section once", 400);
  }
  const known = new Set(sectionIds);
  const seen = new Set<string>();
  for (const id of orderedIds) {
    if (!known.has(id) || seen.has(id)) {
      throw new ProjectError("Section order must include every section once", 400);
    }
    seen.add(id);
  }
  return orderedIds.map((id, position) => ({ id, position }));
}

export type ProjectMemberRef = {
  id: string;
  userId: string;
  role: ProjectRoleName;
};

export function validateMemberChange(
  members: ProjectMemberRef[],
  change:
    | { type: "add"; userId: string; role: ProjectRoleName }
    | { type: "update"; memberId: string; role: ProjectRoleName }
    | { type: "remove"; memberId: string }
): { ok: true } | { ok: false; error: string } {
  if (change.type === "add") {
    if (members.some((member) => member.userId === change.userId)) {
      return { ok: false, error: "That person is already a project member" };
    }
    return { ok: true };
  }

  const target = members.find((member) => member.id === change.memberId);
  if (!target) return { ok: false, error: "Member not found" };

  const ownerCount = members.filter((member) => member.role === "OWNER").length;
  const removesLastOwner =
    target.role === "OWNER" &&
    ownerCount <= 1 &&
    (change.type === "remove" || change.role !== "OWNER");

  if (removesLastOwner) {
    return { ok: false, error: "A project must keep at least one owner" };
  }

  return { ok: true };
}
