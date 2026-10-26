import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { deleteProject, getProjectDetail, updateProject } from "@/lib/projects";
import { projectUpdateSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const detail = await getProjectDetail(user.id, id);
    return NextResponse.json(detail);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const data = projectUpdateSchema.parse(await request.json());
    const project = await updateProject(user.id, id, data);
    return NextResponse.json({ project });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    await deleteProject(user.id, id);
    return NextResponse.json({ message: "Project deleted" });
  } catch (error) {
    return handleApiError(error);
  }
}
