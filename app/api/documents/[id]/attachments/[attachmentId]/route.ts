import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { canAccessDocument, canEditDocument } from "@/lib/documents";
import { deleteAttachmentUrl } from "@/lib/blob-storage";

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
    await deleteAttachmentUrl(attachment.url);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
