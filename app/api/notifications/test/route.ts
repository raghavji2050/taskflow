import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { isPushConfigured, sendTestPushToUser } from "@/lib/push";

export async function POST() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!isPushConfigured()) {
      return NextResponse.json({ error: "Push not configured" }, { status: 503 });
    }

    const result = await sendTestPushToUser(user.id);
    if (result.sent === 0) {
      return NextResponse.json(
        { error: result.error ?? "Failed to deliver test notification" },
        { status: result.error === "No push subscription found" ? 400 : 502 }
      );
    }

    return NextResponse.json({ message: "Test notification sent", sent: result.sent });
  } catch (error) {
    return handleApiError(error);
  }
}
