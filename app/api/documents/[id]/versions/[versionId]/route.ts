import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { canAccessDocument } from "@/lib/documents";

type RouteContext = { params: Promise<{ id: string; versionId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, versionId } = await context.params;
    if (!(await canAccessDocument(user.id, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const version = await prisma.documentVersion.findFirst({
      where: { id: versionId, documentId: id },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ version });
  } catch (error) {
    return handleApiError(error);
  }
}
