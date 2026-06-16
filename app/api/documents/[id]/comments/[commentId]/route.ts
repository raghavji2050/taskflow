import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { documentCommentSchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { canAccessDocument, canEditDocument } from "@/lib/documents";

type RouteContext = { params: Promise<{ id: string; commentId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, commentId } = await context.params;
    if (!(await canAccessDocument(user.id, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const existing = await prisma.documentComment.findFirst({
      where: { id: commentId, documentId: id },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.userId !== user.id && !(await canEditDocument(user.id, id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = documentCommentSchema.parse(await request.json());
    const comment = await prisma.documentComment.update({
      where: { id: commentId },
      data: { body: data.body },
      include: { user: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ comment });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, commentId } = await context.params;
    if (!(await canAccessDocument(user.id, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const existing = await prisma.documentComment.findFirst({
      where: { id: commentId, documentId: id },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.userId !== user.id && !(await canEditDocument(user.id, id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.documentComment.delete({ where: { id: commentId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
