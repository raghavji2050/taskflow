import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api";
import { addGoalLink } from "@/lib/goals-data";
import { goalErrorResponse } from "@/lib/goals-http";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ projectId: z.string().max(191).optional(), taskId: z.string().max(191).optional() });

export async function POST(request: Request, ctx: Ctx) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    return NextResponse.json({ goal: await addGoalLink(user.id, (await ctx.params).id, parsed.data) }, { status: 201 });
  } catch (error) {
    return goalErrorResponse(error);
  }
}
