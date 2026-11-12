import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api";
import { createGoal, listGoals } from "@/lib/goals-data";
import { goalErrorResponse, goalInputSchema } from "@/lib/goals-http";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const sp = new URL(request.url).searchParams;
    const workspaceId = sp.get("workspaceId");
    if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    return NextResponse.json(await listGoals(user.id, workspaceId, { includeClosed: sp.get("includeClosed") === "true" }));
  } catch (error) {
    return goalErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => null);
    const parsed = goalInputSchema.extend({ workspaceId: z.string().max(191) }).safeParse(body);
    if (!parsed.success || !parsed.data.title || !parsed.data.workspaceId) {
      return NextResponse.json({ error: "title and workspaceId are required" }, { status: 400 });
    }
    const { workspaceId, ...input } = parsed.data;
    const goal = await createGoal(user.id, workspaceId, { ...input, title: parsed.data.title });
    return NextResponse.json({ goal }, { status: 201 });
  } catch (error) {
    return goalErrorResponse(error);
  }
}
