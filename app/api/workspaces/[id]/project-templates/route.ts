import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { listProjectTemplates } from "@/lib/project-templates";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ templates: await listProjectTemplates(user.id, (await ctx.params).id) });
  } catch (error) {
    return handleApiError(error);
  }
}
