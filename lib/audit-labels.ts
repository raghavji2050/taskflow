/** Pure audit-trail vocabulary (shared by API, UI, CSV and MCP). */
export const AUDIT_ACTIONS = {
  "workspace.created": "Created workspace",
  "workspace.renamed": "Renamed workspace",
  "workspace.archived": "Archived workspace",
  "workspace.restored": "Restored workspace",
  "workspace.settings_changed": "Changed workspace settings",
  "member.invited": "Invited member",
  "member.joined": "Joined workspace",
  "member.invite_link_created": "Created invite link",
  "member.invite_link_revoked": "Turned off invite link",
  "member.role_changed": "Changed member role",
  "member.removed": "Removed member",
  "project.created": "Created project",
  "project.updated": "Updated project",
  "project.deleted": "Moved project to trash",
  "project.member_added": "Added project member",
  "project.member_role_changed": "Changed project role",
  "project.member_removed": "Removed project member",
  "task.created": "Created task",
  "task.deleted": "Moved task to trash",
  "trash.restored": "Restored from trash",
  "trash.purged": "Deleted forever",
  "file.attached": "Attached file",
  "file.removed": "Removed file",
  "goal.created": "Created goal",
  "goal.deleted": "Deleted goal",
  "token.created": "Created API token",
  "token.revoked": "Revoked API token",
  "account.signed_out_everywhere": "Signed out of all devices",
  "account.password_changed": "Changed password",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export const AUDIT_CATEGORIES: Record<string, { label: string; prefixes: string[] }> = {
  members: { label: "Members & access", prefixes: ["member.", "project.member_"] },
  projects: { label: "Projects", prefixes: ["project.created", "project.updated", "project.deleted"] },
  tasks: { label: "Tasks & files", prefixes: ["task.", "file.", "trash."] },
  workspace: { label: "Workspace", prefixes: ["workspace.", "goal."] },
  security: { label: "Security", prefixes: ["token.", "account."] },
};

export const AUDIT_RETENTION_DAYS = 365;

export function auditActionLabel(action: string) {
  return (AUDIT_ACTIONS as Record<string, string>)[action] ?? action.replace(/[._]/g, " ");
}

export function actionsForCategory(category: string | null | undefined): string[] | null {
  if (!category) return null;
  const c = AUDIT_CATEGORIES[category];
  if (!c) return null;
  return Object.keys(AUDIT_ACTIONS).filter((a) => c.prefixes.some((p) => a.startsWith(p)));
}

export function clientIpFrom(headers: { get(name: string): string | null }) {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (fwd || headers.get("x-real-ip") || "").slice(0, 64) || null;
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
  // Neutralise spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function auditCsv(rows: { createdAt: string; actor: string | null; action: string; targetType: string; targetLabel: string | null; details: unknown; ip: string | null }[]) {
  const head = ["Time (UTC)", "Who", "Action", "Target type", "Target", "Details", "IP"];
  const lines = rows.map((r) => [r.createdAt, r.actor ?? "", auditActionLabel(r.action), r.targetType, r.targetLabel ?? "", r.details ?? "", r.ip ?? ""].map(csvCell).join(","));
  return [head.join(","), ...lines].join("\n") + "\n";
}
