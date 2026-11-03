import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { disconnectApp } from "@/lib/mcp/connected-apps";

type RouteContext = { params: Promise<{ clientId: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { clientId } = await context.params;
    const revoked = await disconnectApp(user.id, clientId);
    if (revoked === 0) return NextResponse.json({ error: "App not connected" }, { status: 404 });
    return NextResponse.json({ message: "App disconnected", revoked });
  } catch (error) {
    return handleApiError(error);
  }
}
