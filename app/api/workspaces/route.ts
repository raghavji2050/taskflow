import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { workspaceSchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaces = await prisma.workspace.findMany({
      where: { members: { some: { userId: user.id } } },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        _count: { select: { tasks: true } },
      },
    });

    return NextResponse.json({ workspaces });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = workspaceSchema.parse(await request.json());

    const workspace = await prisma.workspace.create({
      data: {
        name: data.name,
        members: { create: { userId: user.id, role: "OWNER" } },
      },
      include: { members: { include: { user: { select: { id: true, name: true } } } } },
    });

    return NextResponse.json({ workspace }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
