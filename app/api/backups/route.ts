import { NextResponse } from "next/server";
import { authorizeBackupRead, backupUnauthorized, getBackupViewer, hasBackupToken } from "@/lib/backup-auth";
import { BackupRuleError, normalizeSource, parseBackupPathname } from "@/lib/backup-rules";
import { backupStorageAvailable, deleteBackups, findBackup } from "@/lib/backup-store";
import { backupSummary } from "@/lib/backup-service";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

/** GET /api/backups[?source=cpdl] — list (Bearer token or allow-listed session). */
export async function GET(request: Request) {
  if (!(await authorizeBackupRead(request))) return backupUnauthorized();
  if (!backupStorageAvailable()) return NextResponse.json({ backups: [], count: 0, totalBytes: 0 }, { headers: noStore });
  const sourceParam = new URL(request.url).searchParams.get("source");
  try {
    const source = sourceParam ? normalizeSource(sourceParam) : undefined;
    return NextResponse.json(await backupSummary(source), { headers: noStore });
  } catch (e) {
    if (e instanceof BackupRuleError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

/** DELETE /api/backups?pathname=backups/cpdl/<file> — Bearer token or allow-listed session. */
export async function DELETE(request: Request) {
  const allowed = request.headers.get("authorization") ? hasBackupToken(request) : !!(await getBackupViewer());
  if (!allowed) return backupUnauthorized();
  const parsed = parseBackupPathname(new URL(request.url).searchParams.get("pathname"));
  if (!parsed) return NextResponse.json({ error: "Invalid pathname" }, { status: 400 });
  const item = await findBackup(parsed.pathname);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await deleteBackups([item]);
  return NextResponse.json({ ok: true, deleted: parsed.pathname }, { headers: noStore });
}
