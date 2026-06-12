import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { getWorkspaceMembership } from "@/lib/workspace";
import { canManageWorkspace } from "@/lib/workspace-permissions";
import { automationRuleSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const membership = await getWorkspaceMembership(user.id, id);
    if (!membership || !canManageWorkspace(membership)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rules = await prisma.automationRule.findMany({
      where: { workspaceId: id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ rules });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const membership = await getWorkspaceMembership(user.id, id);
    if (!membership || !canManageWorkspace(membership)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = automationRuleSchema.parse(await request.json());
    const rule = await prisma.automationRule.create({
      data: {
        workspaceId: id,
        name: data.name,
        trigger: data.trigger,
        action: data.action,
        config: JSON.stringify(data.config ?? {}),
        enabled: data.enabled ?? true,
      },
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
