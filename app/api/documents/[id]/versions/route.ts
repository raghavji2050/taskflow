import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { documentRestoreVersionSchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import {
  canAccessDocument,
  canEditDocument,
  createDocumentVersion,
} from "@/lib/documents";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    if (!(await canAccessDocument(user.id, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const versions = await prisma.documentVersion.findMany({
      where: { documentId: id },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { versionNumber: "desc" },
    });

    return NextResponse.json({ versions });
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
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = documentRestoreVersionSchema.parse(await request.json());
    const version = await prisma.documentVersion.findFirst({
      where: { id: data.versionId, documentId: id },
    });
    if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });

    const document = await prisma.document.update({
      where: { id },
      data: { title: version.title, body: version.body },
    });

    const newVersion = await createDocumentVersion({
      documentId: id,
      userId: user.id,
      title: version.title,
      body: version.body,
      changeNote: data.changeNote ?? `Restored from v${version.versionNumber}`,
    });

    return NextResponse.json({ document, version: newVersion });
  } catch (error) {
    return handleApiError(error);
  }
}
