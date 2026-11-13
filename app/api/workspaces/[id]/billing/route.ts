import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { getWorkspaceMembership } from "@/lib/workspace-membership";
import { canManageWorkspace } from "@/lib/workspace-permissions";
import { getWorkspaceBilling } from "@/lib/billing";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/workspaces/:id/billing — plan, status, usage vs limits (any member). */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await context.params;
    const membership = await getWorkspaceMembership(user.id, id);
    if (!membership) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    const billing = await getWorkspaceBilling(id);
    if (!billing) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    return NextResponse.json({ billing: { ...billing, canManage: canManageWorkspace(membership) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleApiError(error);
  }
}
