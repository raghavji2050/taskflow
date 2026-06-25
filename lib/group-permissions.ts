export type GroupRole = "OWNER" | "ADMIN" | "MEMBER";

export function canManageGroupSettings(role: GroupRole) {
  return role === "OWNER" || role === "ADMIN";
}

export function canRemoveMember(actorRole: GroupRole, targetRole: GroupRole) {
  if (actorRole === "MEMBER") return false;
  if (targetRole === "OWNER") return false;
  if (actorRole === "ADMIN" && targetRole === "ADMIN") return false;
  return true;
}

export function roleLabel(role: GroupRole) {
  switch (role) {
    case "OWNER":
      return "Owner";
    case "ADMIN":
      return "Admin";
    default:
      return null;
  }
}
