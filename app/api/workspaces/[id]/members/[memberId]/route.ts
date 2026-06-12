import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { getWorkspaceMembership } from "@/lib/workspace-membership";
import { canManageWorkspace } from "@/lib/workspace-permissions";
import { removeWorkspaceMember } from "@/lib/workspace-members";
import { broadcastWorkspaceUpdate } from "@/lib/realtime";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string; memberId: string }> };

const memberSchema = z.object({
  canInviteMembers: z.boolean().optional(),
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]).optional(),
});

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, memberId } = await context.params;
    const membership = await getWorkspaceMembership(user.id, id);

    if (!membership || !canManageWorkspace(membership)) {
      return NextResponse.json({ error: "Only workspace owners or admins can change member permissions" }, { status: 403 });
    }

    const target = await prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId: id },
    });

    if (!target) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (target.role === "OWNER") {
      return NextResponse.json({ error: "Owner permissions cannot be changed" }, { status: 400 });
    }

    const body = memberSchema.parse(await request.json());

    const member = await prisma.workspaceMember.update({
      where: { id: memberId },
      data: {
        ...(body.canInviteMembers !== undefined && { canInviteMembers: body.canInviteMembers }),
        ...(body.role !== undefined && { role: body.role }),
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    broadcastWorkspaceUpdate({
      workspaceId: id,
      reason: "permissions_updated",
      actorId: user.id,
      notifyUserIds: [member.userId],
    });

    return NextResponse.json({ member });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, memberId } = await context.params;
    const membership = await getWorkspaceMembership(user.id, id);

    if (!membership || !canManageWorkspace(membership)) {
      return NextResponse.json({ error: "Only the workspace owner can remove members" }, { status: 403 });
    }

    const result = await removeWorkspaceMember({
      workspaceId: id,
      memberId,
      actorId: user.id,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ message: "Member removed" });
  } catch (error) {
    return handleApiError(error);
  }
}
