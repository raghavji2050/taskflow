import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { boardColumnSchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { getWorkspaceMembership } from "@/lib/workspace";
import { canEditWorkspaceTasks } from "@/lib/workspace-permissions";

type RouteContext = { params: Promise<{ id: string }> };

async function getColumnWithAccess(userId: string, columnId: string) {
  const column = await prisma.boardColumn.findUnique({ where: { id: columnId } });
  if (!column) return null;

  if (column.workspaceId) {
    const membership = await getWorkspaceMembership(userId, column.workspaceId);
    if (!membership) return null;
    return { column, canEdit: canEditWorkspaceTasks(membership) };
  }

  if (column.userId === userId) return { column, canEdit: true };
  return null;
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const access = await getColumnWithAccess(user.id, id);
    if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!access.canEdit) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const data = boardColumnSchema.parse(await request.json());
    const column = await prisma.boardColumn.update({
      where: { id },
      data: {
        name: data.name,
        ...(data.color && { color: data.color }),
        ...(data.status !== undefined && { status: data.status }),
      },
    });

    return NextResponse.json({ column });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const access = await getColumnWithAccess(user.id, id);
    if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!access.canEdit) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { column } = access;
    const fallback = await prisma.boardColumn.findFirst({
      where: column.workspaceId
        ? { workspaceId: column.workspaceId, id: { not: id } }
        : { userId: column.userId, workspaceId: null, id: { not: id } },
      orderBy: { position: "asc" },
    });

    await prisma.task.updateMany({
      where: { boardColumnId: id },
      data: { boardColumnId: fallback?.id ?? null },
    });

    await prisma.boardColumn.delete({ where: { id } });
    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    return handleApiError(error);
  }
}
