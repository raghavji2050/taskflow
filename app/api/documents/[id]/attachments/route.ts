import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import {
  canAccessDocument,
  canEditDocument,
  documentAttachmentSelect,
} from "@/lib/documents";
import { MAX_DOCUMENT_ATTACHMENT_BYTES } from "@/lib/attachments";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    if (!(await canAccessDocument(user.id, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const attachments = await prisma.documentAttachment.findMany({
      where: { documentId: id },
      orderBy: { createdAt: "desc" },
      select: documentAttachmentSelect,
    });

    return NextResponse.json({ attachments });
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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_DOCUMENT_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: "File exceeds 20 MB limit" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const uploadDir = path.join(process.cwd(), "public", "uploads", "documents", id);
    await mkdir(uploadDir, { recursive: true });

    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const storedName = `${Date.now()}-${safeName}`;
    const filepath = path.join(uploadDir, storedName);
    await writeFile(filepath, buffer);

    const attachment = await prisma.documentAttachment.create({
      data: {
        documentId: id,
        userId: user.id,
        filename: file.name,
        url: `/uploads/documents/${id}/${storedName}`,
        mimeType: file.type || "application/octet-stream",
        size: buffer.length,
      },
      select: documentAttachmentSelect,
    });

    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
