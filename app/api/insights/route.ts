import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { loadInsights } from "@/lib/insights-data";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const tz = Number(searchParams.get("tzOffset") ?? "0");
    const weeks = Number(searchParams.get("weeks") ?? "8");
    const insights = await loadInsights(user.id, {
      workspaceId: searchParams.get("workspaceId") || null,
      projectId: searchParams.get("projectId") || null,
      tzOffsetMinutes: Number.isFinite(tz) && Math.abs(tz) <= 840 ? tz : 0,
      weeks: Number.isFinite(weeks) ? weeks : 8,
    });
    return NextResponse.json(insights);
  } catch (error) {
    return handleApiError(error);
  }
}
