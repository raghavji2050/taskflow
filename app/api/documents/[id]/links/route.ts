import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { documentLinkSchema, documentUnlinkSchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import {
  canAccessDocument,
  canEditDocument,
  linkDocumentToMessage,
  linkDocumentToTask,
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

    const [tasks, messages] = await Promise.all([
      prisma.documentTask.findMany({
        where: { documentId: id },
        include: {
          task: {
            select: { id: true, title: true, status: true, workspaceId: true },
          },
        },
      }),
      prisma.documentMessage.findMany({
        where: { documentId: id },
        include: {
          message: {
            select: {
              id: true,
              body: true,
              conversationId: true,
              createdAt: true,
              user: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      tasks: tasks.map((t) => t.task),
      messages: messages.map((m) => m.message),
    });
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

    const data = documentLinkSchema.parse(await request.json());

    if (data.kind === "task") {
      const link = await linkDocumentToTask(user.id, id, data.taskId);
      if (!link) return NextResponse.json({ error: "Cannot link task" }, { status: 400 });
      return NextResponse.json({ success: true }, { status: 201 });
    }

    const link = await linkDocumentToMessage(user.id, id, data.messageId);
    if (!link) return NextResponse.json({ error: "Cannot link message" }, { status: 400 });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    if (!(await canEditDocument(user.id, id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = documentUnlinkSchema.parse(await request.json());

    if (data.kind === "task") {
      await prisma.documentTask.deleteMany({
        where: { documentId: id, taskId: data.taskId },
      });
    } else {
      await prisma.documentMessage.deleteMany({
        where: { documentId: id, messageId: data.messageId },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
