import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { saveProjectAsTemplate } from "@/lib/project-templates";
import { saveTemplateSchema } from "@/lib/project-templates-http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const data = saveTemplateSchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json({ template: await saveProjectAsTemplate(user.id, (await ctx.params).id, data) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
