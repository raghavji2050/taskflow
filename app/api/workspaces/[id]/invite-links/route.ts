import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api";
import { createInviteLink, listInviteLinks } from "@/lib/invite-links";
import { inviteLinkErrorResponse } from "@/lib/invite-links-http";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]).optional(),
  expiresInDays: z.number().int().min(1).max(30).optional(),
  maxUses: z.number().int().min(1).max(1000).nullable().optional(),
});

export async function GET(_r: Request, ctx: Ctx) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ links: await listInviteLinks(user.id, (await ctx.params).id) });
  } catch (error) {
    return inviteLinkErrorResponse(error);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const { link, url } = await createInviteLink(user.id, (await ctx.params).id, parsed.data);
    return NextResponse.json({ link, url }, { status: 201 });
  } catch (error) {
    return inviteLinkErrorResponse(error);
  }
}
