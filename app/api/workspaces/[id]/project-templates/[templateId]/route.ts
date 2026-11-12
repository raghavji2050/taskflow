import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { deleteProjectTemplate } from "@/lib/project-templates";

type Ctx = { params: Promise<{ id: string; templateId: string }> };

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id, templateId } = await ctx.params;
    return NextResponse.json(await deleteProjectTemplate(user.id, id, templateId));
  } catch (error) {
    return handleApiError(error);
  }
}
