import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { recordAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await context.params;
    const result = await prisma.apiToken.updateMany({
      where: { id, userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) return NextResponse.json({ error: "Token not found" }, { status: 404 });
    await recordAudit({ actorId: user.id, action: "token.revoked", targetType: "token", targetId: id });
    return NextResponse.json({ message: "Token revoked" });
  } catch (error) {
    return handleApiError(error);
  }
}
