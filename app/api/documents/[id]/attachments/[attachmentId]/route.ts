import { NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { canAccessDocument, canEditDocument } from "@/lib/documents";

type RouteContext = { params: Promise<{ id: string; attachmentId: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, attachmentId } = await context.params;
    if (!(await canAccessDocument(user.id, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!(await canEditDocument(user.id, id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const attachment = await prisma.documentAttachment.findFirst({
      where: { id: attachmentId, documentId: id },
    });
    if (!attachment) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    await prisma.documentAttachment.delete({ where: { id: attachmentId } });

    if (attachment.url.startsWith("/uploads/")) {
      const filepath = path.join(process.cwd(), "public", attachment.url);
      await unlink(filepath).catch(() => undefined);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
