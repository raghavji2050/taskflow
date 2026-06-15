import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { getTotalUnreadCount } from "@/lib/conversations";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const totalUnread = await getTotalUnreadCount(user.id);
    return NextResponse.json({ totalUnread });
  } catch (error) {
    return handleApiError(error);
  }
}
