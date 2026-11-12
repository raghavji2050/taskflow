import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { createProjectFromTemplate } from "@/lib/project-templates";
import { fromTemplateSchema } from "@/lib/project-templates-http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const data = fromTemplateSchema.parse(await request.json());
    return NextResponse.json(await createProjectFromTemplate(user.id, (await ctx.params).id, data), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
