import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

const inviteSchema = z.object({ email: z.string().email() });

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId: id, userId: user.id, role: "OWNER" },
    });

    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { email } = inviteSchema.parse(await request.json());
    const invitee = await prisma.user.findUnique({ where: { email } });
    if (!invitee) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const member = await prisma.workspaceMember.create({
      data: { workspaceId: id, userId: invitee.id, role: "MEMBER" },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
