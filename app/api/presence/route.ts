import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { getOnlineUserIds, getOnlineStatus } from "@/lib/realtime";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const userIds = searchParams
      .get("userIds")
      ?.split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (!userIds?.length) {
      return NextResponse.json({ onlineUserIds: getOnlineUserIds() });
    }

    return NextResponse.json({ online: getOnlineStatus(userIds) });
  } catch (error) {
    return handleApiError(error);
  }
}
