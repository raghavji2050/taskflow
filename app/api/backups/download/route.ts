import { NextResponse } from "next/server";
import { authorizeBackupRead, backupUnauthorized } from "@/lib/backup-auth";
import { parseBackupPathname } from "@/lib/backup-rules";
import { findBackup, openBackupStream } from "@/lib/backup-store";

export const dynamic = "force-dynamic";

/** GET /api/backups/download?pathname=backups/cpdl/<file> — streams the private file. */
export async function GET(request: Request) {
  if (!(await authorizeBackupRead(request))) return backupUnauthorized();
  const parsed = parseBackupPathname(new URL(request.url).searchParams.get("pathname"));
  if (!parsed) return NextResponse.json({ error: "Invalid pathname" }, { status: 400 });
  const item = await findBackup(parsed.pathname);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const stream = await openBackupStream(item);
  if (!stream) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Length": String(item.size),
      "Content-Disposition": `attachment; filename="${item.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
