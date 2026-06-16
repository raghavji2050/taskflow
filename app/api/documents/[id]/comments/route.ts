import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { documentCommentSchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { canAccessDocument, canEditDocument } from "@/lib/documents";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    if (!(await canAccessDocument(user.id, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const comments = await prisma.documentComment.findMany({
      where: { documentId: id, parentId: null },
      include: {
        user: { select: { id: true, name: true } },
        version: { select: { id: true, versionNumber: true } },
        replies: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ comments });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    if (!(await canAccessDocument(user.id, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!(await canEditDocument(user.id, id))) {
      return NextResponse.json({ error: "Viewers cannot comment" }, { status: 403 });
    }

    const data = documentCommentSchema.parse(await request.json());

    if (data.versionId) {
      const version = await prisma.documentVersion.findFirst({
        where: { id: data.versionId, documentId: id },
      });
      if (!version) {
        return NextResponse.json({ error: "Version not found" }, { status: 404 });
      }
    }

    const comment = await prisma.documentComment.create({
      data: {
        documentId: id,
        userId: user.id,
        body: data.body,
        parentId: data.parentId ?? null,
        versionId: data.versionId ?? null,
      },
      include: {
        user: { select: { id: true, name: true } },
        version: { select: { id: true, versionNumber: true } },
      },
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
