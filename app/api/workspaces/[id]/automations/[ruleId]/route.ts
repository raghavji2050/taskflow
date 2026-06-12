import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { getWorkspaceMembership } from "@/lib/workspace";
import { canManageWorkspace } from "@/lib/workspace-permissions";

type RouteContext = { params: Promise<{ id: string; ruleId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, ruleId } = await context.params;
    const membership = await getWorkspaceMembership(user.id, id);
    if (!membership || !canManageWorkspace(membership)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { enabled } = await request.json();
    const rule = await prisma.automationRule.update({
      where: { id: ruleId, workspaceId: id },
      data: { enabled: Boolean(enabled) },
    });

    return NextResponse.json({ rule });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, ruleId } = await context.params;
    const membership = await getWorkspaceMembership(user.id, id);
    if (!membership || !canManageWorkspace(membership)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.automationRule.delete({ where: { id: ruleId, workspaceId: id } });
    return NextResponse.json({ message: "Rule deleted" });
  } catch (error) {
    return handleApiError(error);
  }
}
