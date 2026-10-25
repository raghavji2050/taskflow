import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { workspaceSchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import {
  DEFAULT_PROJECT_COLOR,
  DEFAULT_PROJECT_DESCRIPTION,
  DEFAULT_PROJECT_NAME,
  DEFAULT_SECTION_NAME,
} from "@/lib/project-sections";

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
      orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
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
      where: { members: { some: { userId: user.id } }, archivedAt: null },
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
        projects: {
          create: {
            name: DEFAULT_PROJECT_NAME,
            description: DEFAULT_PROJECT_DESCRIPTION,
            color: DEFAULT_PROJECT_COLOR,
            members: { create: { userId: user.id, role: "OWNER" } },
            sections: { create: { name: DEFAULT_SECTION_NAME, position: 0 } },
          },
        },
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
