import { NextResponse } from "next/server";
import { getBackupViewer } from "@/lib/backup-auth";

export const dynamic = "force-dynamic";

/** Lets the sidebar show the Backups link only to allow-listed users. */
export async function GET() {
  const viewer = await getBackupViewer();
  return NextResponse.json({ allowed: !!viewer }, { headers: { "Cache-Control": "private, no-store" } });
}
