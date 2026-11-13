import { assertWithinPlan } from "@/lib/billing";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

import { getAuthenticatedUser, handleApiError } from "@/lib/api";

import { sendWorkspaceInvite } from "@/lib/invitations";
import { inviteByEmailWithoutAccount } from "@/lib/invite-links";
import { canGrantRole } from "@/lib/invite-link-rules";

import { getWorkspaceMembership } from "@/lib/workspace-membership";

import { canInviteMembers, canManageWorkspace } from "@/lib/workspace-permissions";

import { z } from "zod";



type RouteContext = { params: Promise<{ id: string }> };



const inviteSchema = z.object({ email: z.string().email(), role: z.enum(["ADMIN", "MEMBER", "VIEWER"]).optional() });



export async function GET(_request: Request, context: RouteContext) {

  try {

    const user = await getAuthenticatedUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });



    const { id } = await context.params;

    const membership = await getWorkspaceMembership(user.id, id);

    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });



    const permissions = {

      canInvite: canInviteMembers(membership, membership.workspace),

      canManage: canManageWorkspace(membership),

      allowMemberInvites: membership.workspace.allowMemberInvites,

    };



    let pendingInvitations: Awaited<ReturnType<typeof prisma.workspaceInvitation.findMany>> = [];



    if (permissions.canInvite) {

      const memberUserIds = new Set(

        (

          await prisma.workspaceMember.findMany({

            where: { workspaceId: id },

            select: { userId: true },

          })

        ).map((m) => m.userId)

      );



      const invitations = await prisma.workspaceInvitation.findMany({

        where: { workspaceId: id, status: "PENDING" },

        include: {

          invitee: { select: { id: true, name: true, email: true } },

          inviter: { select: { id: true, name: true } },

        },

        orderBy: { createdAt: "desc" },

      });



      const staleIds = invitations

        .filter((inv) => memberUserIds.has(inv.inviteeId))

        .map((inv) => inv.id);



      if (staleIds.length) {

        await prisma.workspaceInvitation.updateMany({

          where: { id: { in: staleIds } },

          data: { status: "ACCEPTED" },

        });

      }



      pendingInvitations = invitations.filter((inv) => !memberUserIds.has(inv.inviteeId));

    }



    return NextResponse.json({ pendingInvitations, permissions });

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



    if (!membership || !canInviteMembers(membership, membership.workspace)) {

      return NextResponse.json({ error: "You do not have permission to invite members" }, { status: 403 });

    }



    const { email, role = "MEMBER" } = inviteSchema.parse(await request.json());
    if (!canGrantRole(membership.role, role)) {
      return NextResponse.json({ error: "Only owners and admins can invite admins" }, { status: 403 });
    }
    await assertWithinPlan(id, "members");
    const result = await sendWorkspaceInvite({ workspaceId: id, inviterId: user.id, inviteeEmail: email, role });
    if ("error" in result) {
      // No account yet: send a single-use join link to that email instead of failing.
      if (result.status === 404 && result.error.startsWith("No account")) {
        const sent = await inviteByEmailWithoutAccount(user.id, id, email, role);
        return NextResponse.json(
          { message: sent.emailSent ? "Invite email sent" : "Invite link created", pendingSignup: true, emailSent: sent.emailSent, inviteUrl: sent.url, link: sent.link },
          { status: 201 }
        );
      }
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ message: "Invitation sent", invitation: result.invitation }, { status: result.status });
  } catch (error) {

    return handleApiError(error);

  }

}


