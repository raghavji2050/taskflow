import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { deleteSection, updateSection } from "@/lib/projects";
import { projectSectionSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string; sectionId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, sectionId } = await context.params;
    const data = projectSectionSchema.parse(await request.json());
    const section = await updateSection(user.id, id, sectionId, data.name);
    return NextResponse.json({ section });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, sectionId } = await context.params;
    await deleteSection(user.id, id, sectionId);
    return NextResponse.json({ message: "Section deleted" });
  } catch (error) {
    return handleApiError(error);
  }
}
