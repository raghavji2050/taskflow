import type { WorkspaceRole } from "@prisma/client";

export interface WorkspaceMembership {
  role: WorkspaceRole;
  canInviteMembers: boolean;
}

export interface WorkspaceInviteSettings {
  allowMemberInvites: boolean;
}

export function isOwnerOrAdmin(role: WorkspaceRole) {
  return role === "OWNER" || role === "ADMIN";
}

export function canInviteMembers(
  membership: WorkspaceMembership | null | undefined,
  workspace: WorkspaceInviteSettings | null | undefined
): boolean {
  if (!membership || !workspace) return false;
  if (isOwnerOrAdmin(membership.role)) return true;
  if (membership.role === "VIEWER") return false;
  if (membership.canInviteMembers) return true;
  if (workspace.allowMemberInvites) return true;
  return false;
}

export function canManageWorkspace(
  membership: WorkspaceMembership | null | undefined
): boolean {
  return membership ? isOwnerOrAdmin(membership.role) : false;
}

export function canEditWorkspaceTasks(
  membership: WorkspaceMembership | null | undefined
): boolean {
  if (!membership) return false;
  return membership.role !== "VIEWER";
}

export function canViewWorkspace(
  membership: WorkspaceMembership | null | undefined
): boolean {
  return !!membership;
}
