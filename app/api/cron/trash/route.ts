import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { purgeExpiredTrash } from "@/lib/trash";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await purgeExpiredTrash();
    console.info("[cron:trash]", result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[cron:trash] failed", error);
    return NextResponse.json({ error: "Purge failed" }, { status: 500 });
  }
}
