import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { createProject, listVisibleProjects } from "@/lib/projects";
import { projectListQuerySchema, projectSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const { archived } = projectListQuerySchema.parse({
      archived: new URL(request.url).searchParams.get("archived") ?? undefined,
    });
    const projects = await listVisibleProjects(user.id, id, archived);
    return NextResponse.json({ projects });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const data = projectSchema.parse(await request.json());
    const project = await createProject({
      userId: user.id,
      workspaceId: id,
      name: data.name,
      description: data.description,
      color: data.color,
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
