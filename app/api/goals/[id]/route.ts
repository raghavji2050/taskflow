import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api";
import { deleteGoal, getGoal, updateGoal } from "@/lib/goals-data";
import { goalErrorResponse, goalInputSchema } from "@/lib/goals-http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_r: Request, ctx: Ctx) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ goal: await getGoal(user.id, (await ctx.params).id) });
  } catch (error) {
    return goalErrorResponse(error);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = goalInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    return NextResponse.json({ goal: await updateGoal(user.id, (await ctx.params).id, parsed.data) });
  } catch (error) {
    return goalErrorResponse(error);
  }
}

export async function DELETE(_r: Request, ctx: Ctx) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json(await deleteGoal(user.id, (await ctx.params).id));
  } catch (error) {
    return goalErrorResponse(error);
  }
}
