import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { documentUpdateSchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import {
  canAccessDocument,
  canEditDocument,
  createDocumentVersion,
  documentDetailInclude,
  serializeDocumentDetail,
} from "@/lib/documents";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const doc = await canAccessDocument(user.id, id);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        ...documentDetailInclude,
        children: {
          where: { archived: false },
          select: { id: true, title: true, type: true, icon: true, updatedAt: true },
          orderBy: { position: "asc" },
        },
      },
    });

    if (!document) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ document: serializeDocumentDetail(document) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    if (!(await canAccessDocument(user.id, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!(await canEditDocument(user.id, id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = documentUpdateSchema.parse(await request.json());
    const existing = await prisma.document.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const nextTitle = data.title ?? existing.title;
    const nextBody = data.body ?? existing.body;
    const contentChanged =
      nextTitle !== existing.title || nextBody !== existing.body;

    const document = await prisma.document.update({
      where: { id },
      data: {
        title: data.title,
        body: data.body,
        type: data.type,
        icon: data.icon,
        parentId: data.parentId,
        pinned: data.pinned,
        archived: data.archived,
      },
      include: documentDetailInclude,
    });

    if (contentChanged) {
      await createDocumentVersion({
        documentId: id,
        userId: user.id,
        title: nextTitle,
        body: nextBody,
        changeNote: data.changeNote ?? null,
      });
    }

    return NextResponse.json({ document: serializeDocumentDetail(document) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    if (!(await canAccessDocument(user.id, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!(await canEditDocument(user.id, id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.document.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
