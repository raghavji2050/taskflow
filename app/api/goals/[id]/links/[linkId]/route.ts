import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api";
import { removeGoalLink } from "@/lib/goals-data";
import { goalErrorResponse } from "@/lib/goals-http";

type Ctx = { params: Promise<{ id: string; linkId: string }> };

export async function DELETE(_r: Request, ctx: Ctx) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id, linkId } = await ctx.params;
    return NextResponse.json({ goal: await removeGoalLink(user.id, id, linkId) });
  } catch (error) {
    return goalErrorResponse(error);
  }
}
