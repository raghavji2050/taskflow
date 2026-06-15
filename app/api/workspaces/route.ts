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
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
        },
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
    const name = data.name.trim();

    const normalized = name.toLowerCase();
    const userWorkspaces = await prisma.workspace.findMany({
      where: { members: { some: { userId: user.id } } },
      select: { id: true, name: true },
    });
    const existing = userWorkspaces.find((w) => w.name.trim().toLowerCase() === normalized);

    if (existing) {
      return NextResponse.json(
        { error: `You already have a workspace named "${existing.name}"` },
        { status: 409 }
      );
    }

    const workspace = await prisma.workspace.create({
      data: {
        name,
        members: { create: { userId: user.id, role: "OWNER" } },
      },
      include: { members: { include: { user: { select: { id: true, name: true } } } } },
    });

    const { createWorkspaceChannelOnCreate } = await import("@/lib/conversations");
    await createWorkspaceChannelOnCreate(workspace.id, user.id);

    return NextResponse.json({ workspace }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
