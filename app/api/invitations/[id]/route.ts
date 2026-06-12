import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { getWorkspaceMembership } from "@/lib/workspace-membership";
import { canManageWorkspace } from "@/lib/workspace-permissions";
import { revokeWorkspaceInvitation } from "@/lib/workspace-members";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;

    const invitation = await prisma.workspaceInvitation.findUnique({
      where: { id },
      select: { id: true, workspaceId: true, status: true },
    });

    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    const membership = await getWorkspaceMembership(user.id, invitation.workspaceId);
    if (!membership || !canManageWorkspace(membership)) {
      return NextResponse.json({ error: "Only the workspace owner can revoke invitations" }, { status: 403 });
    }

    const result = await revokeWorkspaceInvitation({
      invitationId: id,
      actorId: user.id,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ message: "Invitation revoked" });
  } catch (error) {
    return handleApiError(error);
  }
}
