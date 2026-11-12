import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api";
import { isBlobStorageConfigured } from "@/lib/blob-storage";
import { addTaskAttachment, listTaskAttachments } from "@/lib/task-attachments-data";
import { attachmentErrorResponse } from "@/lib/task-attachments-http";
import { MAX_SERVER_UPLOAD_BYTES, MAX_TASK_ATTACHMENT_BYTES } from "@/lib/task-attachment-rules";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await context.params;
    const attachments = await listTaskAttachments(user.id, id);
    return NextResponse.json({ attachments, directUpload: isBlobStorageConfigured(), maxBytes: MAX_TASK_ATTACHMENT_BYTES });
  } catch (error) {
    return attachmentErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await context.params;
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
    // On Vercel big bodies never reach us; locally (no Blob) allow the full limit.
    const maxBytes = isBlobStorageConfigured() ? MAX_SERVER_UPLOAD_BYTES : MAX_TASK_ATTACHMENT_BYTES;
    const attachment = await addTaskAttachment(
      user.id,
      id,
      { filename: file.name, mimeType: file.type, data: Buffer.from(await file.arrayBuffer()) },
      maxBytes
    );
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    return attachmentErrorResponse(error);
  }
}
