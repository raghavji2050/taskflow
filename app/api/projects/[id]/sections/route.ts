import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { createSection, requireProjectAccess } from "@/lib/projects";
import { projectSectionSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    await requireProjectAccess(user.id, id);
    const sections = await prisma.projectSection.findMany({
      where: { projectId: id },
      orderBy: { position: "asc" },
    });
    return NextResponse.json({ sections });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const data = projectSectionSchema.parse(await request.json());
    const section = await createSection(user.id, id, data.name);
    return NextResponse.json({ section }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
