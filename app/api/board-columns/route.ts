import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { boardColumnSchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { getWorkspaceMembership } from "@/lib/workspace";
import { canEditWorkspaceTasks } from "@/lib/workspace-permissions";
import { boardColumnScope, ensureBoardColumns } from "@/lib/board-columns";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const wsParam = new URL(request.url).searchParams.get("workspaceId");
    const workspaceId = wsParam || null;
    if (workspaceId) {
      const membership = await getWorkspaceMembership(user.id, workspaceId);
      if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const columns = await ensureBoardColumns(user.id, workspaceId);
    return NextResponse.json({ columns });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : null;
    if (workspaceId) {
      const membership = await getWorkspaceMembership(user.id, workspaceId);
      if (!membership || !canEditWorkspaceTasks(membership)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const data = boardColumnSchema.parse(body);
    const where = boardColumnScope(user.id, workspaceId);
    const maxPos = await prisma.boardColumn.aggregate({ where, _max: { position: true } });

    const column = await prisma.boardColumn.create({
      data: {
        name: data.name,
        color: data.color ?? "#6366f1",
        status: data.status ?? null,
        position: (maxPos._max.position ?? 0) + 1,
        ...where,
      },
    });

    return NextResponse.json({ column }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
