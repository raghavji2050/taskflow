import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { documentSchema, documentsQuerySchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { canEditWorkspaceTasks, getWorkspaceMembership } from "@/lib/workspace";
import {
  createDocumentVersion,
  documentListInclude,
} from "@/lib/documents";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const query = documentsQuerySchema.parse({
      workspaceId: searchParams.get("workspaceId") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      type: searchParams.get("type") ?? undefined,
      archived: searchParams.get("archived") ?? undefined,
      parentId: searchParams.get("parentId") ?? undefined,
      flat: searchParams.get("flat") ?? undefined,
    });

    let where: Prisma.DocumentWhereInput;

    if (query.workspaceId) {
      const membership = await getWorkspaceMembership(user.id, query.workspaceId);
      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      where = { workspaceId: query.workspaceId };
    } else {
      where = { userId: user.id, workspaceId: null };
    }

    where.archived = query.archived === "true";
    if (query.type !== "ALL") where.type = query.type;

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { title: { contains: term } },
            { body: { contains: term } },
          ],
        },
      ];
    } else if (query.parentId) {
      where.parentId = query.parentId;
    } else if (query.flat !== "true") {
      where.parentId = null;
    }

    const documents = await prisma.document.findMany({
      where,
      include: documentListInclude,
      orderBy: [{ pinned: "desc" }, { position: "asc" }, { updatedAt: "desc" }],
    });

    return NextResponse.json({ documents });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = documentSchema.parse(await request.json());

    if (data.workspaceId) {
      const membership = await getWorkspaceMembership(user.id, data.workspaceId);
      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!canEditWorkspaceTasks(membership)) {
        return NextResponse.json({ error: "Viewers cannot create documents" }, { status: 403 });
      }
    }

    if (data.parentId) {
      const parent = await prisma.document.findFirst({
        where: {
          id: data.parentId,
          OR: [
            { userId: user.id, workspaceId: null },
            { workspace: { members: { some: { userId: user.id } } } },
          ],
        },
      });
      if (!parent) {
        return NextResponse.json({ error: "Parent document not found" }, { status: 404 });
      }
    }

    const maxPos = await prisma.document.aggregate({
      where: {
        workspaceId: data.workspaceId ?? null,
        userId: data.workspaceId ? undefined : user.id,
        parentId: data.parentId ?? null,
      },
      _max: { position: true },
    });

    const document = await prisma.document.create({
      data: {
        title: data.title,
        body: data.body,
        type: data.type,
        icon: data.icon ?? null,
        userId: user.id,
        workspaceId: data.workspaceId ?? null,
        parentId: data.parentId ?? null,
        pinned: data.pinned ?? false,
        position: (maxPos._max.position ?? 0) + 1,
      },
      include: documentListInclude,
    });

    await createDocumentVersion({
      documentId: document.id,
      userId: user.id,
      title: document.title,
      body: document.body,
      changeNote: "Initial version",
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
