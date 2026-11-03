import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { listConnectedApps } from "@/lib/mcp/connected-apps";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ apps: await listConnectedApps(user.id) });
  } catch (error) {
    return handleApiError(error);
  }
}
