import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { getWorkspaceMembershipIncludingArchived } from "@/lib/workspace";
import { broadcastWorkspaceUpdate } from "@/lib/realtime";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  archived: z.boolean(),
});

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const { archived } = patchSchema.parse(await request.json());

    const membership = await getWorkspaceMembershipIncludingArchived(user.id, id);
    if (!membership || membership.role !== "OWNER") {
      return NextResponse.json(
        { error: "Only the workspace owner can archive or restore it" },
        { status: 403 }
      );
    }

    const workspace = await prisma.workspace.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
      select: {
        id: true,
        name: true,
        allowMemberInvites: true,
        archivedAt: true,
      },
    });

    broadcastWorkspaceUpdate({
      workspaceId: id,
      reason: archived ? "workspace_archived" : "workspace_restored",
      actorId: user.id,
    });

    return NextResponse.json({ workspace });
  } catch (error) {
    return handleApiError(error);
  }
}
