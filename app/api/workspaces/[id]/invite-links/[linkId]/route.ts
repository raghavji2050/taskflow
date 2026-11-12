import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api";
import { revokeInviteLink } from "@/lib/invite-links";
import { inviteLinkErrorResponse } from "@/lib/invite-links-http";

type Ctx = { params: Promise<{ id: string; linkId: string }> };

export async function DELETE(_r: Request, ctx: Ctx) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id, linkId } = await ctx.params;
    return NextResponse.json(await revokeInviteLink(user.id, id, linkId));
  } catch (error) {
    return inviteLinkErrorResponse(error);
  }
}
