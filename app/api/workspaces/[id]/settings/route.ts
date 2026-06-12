import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

import { getAuthenticatedUser, handleApiError } from "@/lib/api";

import { getWorkspaceMembership } from "@/lib/workspace-membership";

import { canManageWorkspace } from "@/lib/workspace-permissions";

import { broadcastWorkspaceUpdate } from "@/lib/realtime";

import { z } from "zod";



type RouteContext = { params: Promise<{ id: string }> };



const settingsSchema = z.object({

  allowMemberInvites: z.boolean(),

});



export async function PATCH(request: Request, context: RouteContext) {

  try {

    const user = await getAuthenticatedUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });



    const { id } = await context.params;

    const membership = await getWorkspaceMembership(user.id, id);



    if (!membership || !canManageWorkspace(membership)) {

      return NextResponse.json({ error: "Only the workspace owner can change settings" }, { status: 403 });

    }



    const { allowMemberInvites } = settingsSchema.parse(await request.json());



    const workspace = await prisma.workspace.update({

      where: { id },

      data: { allowMemberInvites },

      select: { id: true, name: true, allowMemberInvites: true },

    });



    broadcastWorkspaceUpdate({

      workspaceId: id,

      reason: "permissions_updated",

      actorId: user.id,

    });



    return NextResponse.json({ workspace });

  } catch (error) {

    return handleApiError(error);

  }

}


