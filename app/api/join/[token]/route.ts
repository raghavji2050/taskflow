import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { acceptInviteLink, previewInvite } from "@/lib/invite-links";
import { inviteLinkErrorResponse } from "@/lib/invite-links-http";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_r: Request, ctx: Ctx) {
  try {
    return NextResponse.json(await previewInvite((await ctx.params).token));
  } catch (error) {
    return inviteLinkErrorResponse(error);
  }
}

export async function POST(_r: Request, ctx: Ctx) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Sign in to accept the invite" }, { status: 401 });
    if (!rateLimit(`join:${user.id}`, 20, 60 * 60_000)) return NextResponse.json({ error: "Too many attempts, try later" }, { status: 429 });
    const me = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, email: true } });
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json(await acceptInviteLink(me, (await ctx.params).token));
  } catch (error) {
    return inviteLinkErrorResponse(error);
  }
}
