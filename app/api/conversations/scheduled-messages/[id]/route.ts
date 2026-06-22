import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { scheduledMessageUpdateSchema } from "@/lib/validations";
import {
  cancelScheduledMessage,
  deleteScheduledMessage,
  updateScheduledMessage,
} from "@/lib/scheduled-messages";
import { parseChatUploadFiles, validateChatUploadFiles } from "@/lib/attachments";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const contentType = request.headers.get("content-type") ?? "";
    let input: Record<string, unknown> = {};
    let files: File[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      if (formData.has("body")) input.body = String(formData.get("body") ?? "");
      if (formData.has("scheduledFor")) input.scheduledFor = String(formData.get("scheduledFor"));
      if (formData.has("date")) input.date = String(formData.get("date"));
      if (formData.has("time")) input.time = String(formData.get("time"));
      if (formData.has("timezone")) input.timezone = String(formData.get("timezone"));
      const removeRaw = formData.get("removeAttachmentIds");
      if (removeRaw) {
        try {
          input.removeAttachmentIds = JSON.parse(String(removeRaw)) as string[];
        } catch {
          input.removeAttachmentIds = String(removeRaw).split(",").filter(Boolean);
        }
      }
      files = parseChatUploadFiles(formData);
    } else {
      input = scheduledMessageUpdateSchema.parse(await request.json());
    }

    const parsed = scheduledMessageUpdateSchema.parse(input);
    const uploadError = validateChatUploadFiles(files);
    if (uploadError) {
      return NextResponse.json({ error: uploadError }, { status: 400 });
    }

    const scheduledMessage = await updateScheduledMessage(id, user.id, {
      ...parsed,
      files,
    });

    return NextResponse.json({ scheduledMessage });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const cancel = searchParams.get("cancel") === "true";

    if (cancel) {
      const scheduledMessage = await cancelScheduledMessage(id, user.id);
      return NextResponse.json({ scheduledMessage });
    }

    await deleteScheduledMessage(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
