/** Pure rules for workspace invite links and invite roles. */
export type InviteRole = "ADMIN" | "MEMBER" | "VIEWER";
export const INVITE_ROLES: InviteRole[] = ["ADMIN", "MEMBER", "VIEWER"];
export const MAX_ACTIVE_INVITE_LINKS = 20;

export const ROLE_HELP: Record<"OWNER" | InviteRole, { label: string; can: string }> = {
  OWNER: { label: "Owner", can: "Everything, incl. archiving the workspace and removing members" },
  ADMIN: { label: "Admin", can: "Manage members, roles, projects and settings; sees every project and the activity log" },
  MEMBER: { label: "Member", can: "Create and edit tasks, projects, docs and chat" },
  VIEWER: { label: "Viewer", can: "Read-only: can see tasks, projects and docs but can't change them" },
};

/** Owners/admins can hand out any invite role; other inviters only Member or Viewer. */
export function canGrantRole(actorRole: string, role: InviteRole) {
  if (actorRole === "OWNER" || actorRole === "ADMIN") return true;
  return role === "MEMBER" || role === "VIEWER";
}

export type InviteLinkState = "active" | "expired" | "revoked" | "used_up";

export function inviteLinkState(link: { expiresAt: Date; revokedAt: Date | null; maxUses: number | null; uses: number }, now = new Date()): InviteLinkState {
  if (link.revokedAt) return "revoked";
  if (link.expiresAt.getTime() <= now.getTime()) return "expired";
  if (link.maxUses !== null && link.uses >= link.maxUses) return "used_up";
  return "active";
}

export function clampExpiryDays(days: number | undefined) {
  if (!days || !Number.isFinite(days)) return 7;
  return Math.min(30, Math.max(1, Math.round(days)));
}

export function emailMatches(inviteEmail: string | null, userEmail: string) {
  if (!inviteEmail) return true;
  return inviteEmail.trim().toLowerCase() === userEmail.trim().toLowerCase();
}

export const INVITE_STATE_MESSAGE: Record<Exclude<InviteLinkState, "active">, string> = {
  expired: "This invite link has expired. Ask for a new one.",
  revoked: "This invite link was turned off by the workspace admin.",
  used_up: "This invite link has already been used.",
};
