import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { reorderSections } from "@/lib/projects";
import { projectSectionReorderSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const data = projectSectionReorderSchema.parse(await request.json());
    await reorderSections(user.id, id, data.sectionIds);
    return NextResponse.json({ message: "Reordered" });
  } catch (error) {
    return handleApiError(error);
  }
}
