import { NextResponse } from "next/server";
import { purgeExpiredTrash } from "@/lib/trash";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await purgeExpiredTrash();
  return NextResponse.json(result);
}
