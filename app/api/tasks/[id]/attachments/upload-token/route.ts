import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getAuthenticatedUser } from "@/lib/api";
import { isBlobStorageConfigured } from "@/lib/blob-storage";
import { assertCanAddAttachment } from "@/lib/task-attachments-data";
import { attachmentErrorResponse } from "@/lib/task-attachments-http";
import { MAX_TASK_ATTACHMENT_BYTES, isPathForTask } from "@/lib/task-attachment-rules";

type RouteContext = { params: Promise<{ id: string }> };

/** Issues a short-lived Vercel Blob client token so the browser can upload up to 25 MB directly. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isBlobStorageConfigured()) return NextResponse.json({ error: "Direct upload not configured" }, { status: 501 });
    const { id } = await context.params;
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!isPathForTask(pathname, id)) throw new Error("Invalid upload path");
        let meta: { filename?: string; size?: number } = {};
        try { meta = JSON.parse(clientPayload ?? "{}"); } catch { /* ignore */ }
        await assertCanAddAttachment(user.id, id, String(meta.filename ?? pathname), Number(meta.size ?? 0));
        return { maximumSizeInBytes: MAX_TASK_ATTACHMENT_BYTES, addRandomSuffix: true, validUntil: Date.now() + 10 * 60_000 };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid upload path") return NextResponse.json({ error: error.message }, { status: 400 });
    return attachmentErrorResponse(error);
  }
}
