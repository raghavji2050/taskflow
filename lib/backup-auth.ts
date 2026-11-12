import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api";
import { canViewBackups, isBackupTokenValid, parseAdminEmails } from "@/lib/backup-rules";

export function backupTokenConfigured() {
  return (process.env.TASKFLOW_BACKUP_TOKEN ?? "").length >= 32;
}

export function hasBackupToken(request: Request) {
  return isBackupTokenValid(request.headers.get("authorization"), process.env.TASKFLOW_BACKUP_TOKEN);
}

export function backupAdminEmails() {
  return parseAdminEmails(process.env.BACKUP_ADMIN_EMAILS);
}

export async function getBackupViewer() {
  const user = await getAuthenticatedUser();
  if (!user || !canViewBackups(user, backupAdminEmails())) return null;
  return user;
}

/** Machine (Bearer TASKFLOW_BACKUP_TOKEN) or an allow-listed signed-in user. */
export async function authorizeBackupRead(request: Request): Promise<"token" | "user" | null> {
  if (request.headers.get("authorization")) return hasBackupToken(request) ? "token" : null;
  return (await getBackupViewer()) ? "user" : null;
}

export function backupUnauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
}
