import { NextResponse } from "next/server";
import { backupTokenConfigured, backupUnauthorized, hasBackupToken } from "@/lib/backup-auth";
import { BackupRuleError, backupPathname, normalizeSource, validateSize, backupConfig } from "@/lib/backup-rules";
import { findBackup, publicBackup } from "@/lib/backup-store";
import { pruneBackups } from "@/lib/backup-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/backups/complete   Authorization: Bearer $TASKFLOW_BACKUP_TOKEN
 * Body JSON {filename, size?, source?}. Confirms the file landed (and matches size), then prunes.
 */
export async function POST(request: Request) {
  if (!backupTokenConfigured()) return NextResponse.json({ error: "Backups are not configured" }, { status: 503 });
  if (!hasBackupToken(request)) return backupUnauthorized();
  const body = (await request.json().catch(() => null)) as { filename?: unknown; size?: unknown; source?: unknown } | null;
  try {
    const source = normalizeSource(body?.source);
    const pathname = backupPathname(source, body?.filename as string);
    const size = validateSize(body?.size, backupConfig().maxFileBytes);
    const item = await findBackup(pathname);
    if (!item) return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    if (size !== undefined && item.size !== size) {
      return NextResponse.json({ error: `Size mismatch: stored ${item.size}, expected ${size}` }, { status: 409 });
    }
    const retention = await pruneBackups(source);
    return NextResponse.json({ ok: true, backup: publicBackup(item), ...retention }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof BackupRuleError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
