import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { getActiveTimer } from "@/lib/time-tracking";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const entry = await getActiveTimer(user.id);
    return NextResponse.json({ entry });
  } catch (error) {
    return handleApiError(error);
  }
}
