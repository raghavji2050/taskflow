import { NextResponse } from "next/server";
import { backupTokenConfigured, backupUnauthorized, hasBackupToken } from "@/lib/backup-auth";
import { BackupRuleError, backupConfig, backupPathname, normalizeSource, validateSize } from "@/lib/backup-rules";
import { backupStorageAvailable, createUploadTicket } from "@/lib/backup-store";
import { getAppOrigin } from "@/lib/backup-origin";

export const dynamic = "force-dynamic";

/**
 * POST /api/backups/upload-token   Authorization: Bearer $TASKFLOW_BACKUP_TOKEN
 * Body JSON {filename, size?, source?}  (?format=curl returns a curl -K config instead of JSON)
 */
export async function POST(request: Request) {
  if (!backupTokenConfigured()) return NextResponse.json({ error: "Backups are not configured" }, { status: 503 });
  if (!hasBackupToken(request)) return backupUnauthorized();
  if (!backupStorageAvailable()) return NextResponse.json({ error: "Backup storage is not configured" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { filename?: unknown; size?: unknown; source?: unknown } | null;
  try {
    const cfg = backupConfig();
    const source = normalizeSource(body?.source);
    const pathname = backupPathname(source, body?.filename as string);
    const size = validateSize(body?.size, cfg.maxFileBytes);
    // Retention frees space after upload; only refuse a file that can never fit on its own.
    if (size !== undefined && size > cfg.maxTotalBytes) {
      return NextResponse.json({ error: "File larger than the vault size cap (BACKUP_MAX_TOTAL_MB)" }, { status: 413 });
    }
    const ticket = await createUploadTicket(pathname, cfg.maxFileBytes, getAppOrigin(request));
    const url = new URL(request.url);
    if (url.searchParams.get("format") === "curl") {
      return new Response(ticket.curlConfig, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
    }
    const { curlConfig: _c, ...json } = ticket;
    void _c;
    return NextResponse.json(json, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof BackupRuleError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
