import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { deliverDueScheduledMessages } from "@/lib/scheduled-messages";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await deliverDueScheduledMessages();
  return NextResponse.json(result);
}
