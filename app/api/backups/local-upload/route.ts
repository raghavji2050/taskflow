import { NextResponse } from "next/server";
import { backupConfig, parseBackupPathname } from "@/lib/backup-rules";
import { isBlobBackupStore, verifyLocalUploadSig, writeLocalBackup } from "@/lib/backup-store";

export const dynamic = "force-dynamic";

/** Dev/CI stand-in for the Blob PUT. Disabled on Vercel and whenever Blob is configured. */
export async function PUT(request: Request) {
  if (process.env.VERCEL === "1" || isBlobBackupStore()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = new URL(request.url);
  const parsed = parseBackupPathname(url.searchParams.get("pathname"));
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") ?? "";
  if (!parsed || !verifyLocalUploadSig(parsed.pathname, exp, sig)) {
    return NextResponse.json({ error: "Invalid or expired upload ticket" }, { status: 403 });
  }
  const body = Buffer.from(await request.arrayBuffer());
  if (body.length === 0) return NextResponse.json({ error: "Empty body" }, { status: 400 });
  if (body.length > backupConfig().maxFileBytes) return NextResponse.json({ error: "File too large" }, { status: 413 });
  await writeLocalBackup(parsed.pathname, body);
  return NextResponse.json({ pathname: parsed.pathname, size: body.length });
}
