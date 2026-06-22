import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import {
  scheduledMessageCreateSchema,
  scheduledMessageQuerySchema,
} from "@/lib/validations";
import {
  createScheduledMessage,
  listScheduledMessagesForUser,
} from "@/lib/scheduled-messages";
import { parseChatUploadFiles, validateChatUploadFiles } from "@/lib/attachments";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const query = scheduledMessageQuerySchema.parse({
      status: searchParams.get("status") || undefined,
      conversationId: searchParams.get("conversationId") || undefined,
      page: searchParams.get("page") || undefined,
      limit: searchParams.get("limit") || undefined,
    });

    const result = await listScheduledMessagesForUser(user.id, query);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const contentType = request.headers.get("content-type") ?? "";
    let body = "";
    let conversationId = "";
    let parentId: string | null = null;
    let scheduledFor: string | undefined;
    let date: string | undefined;
    let time: string | undefined;
    let timezone = "UTC";
    let files: File[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      body = String(formData.get("body") ?? "");
      conversationId = String(formData.get("conversationId") ?? "");
      parentId = formData.get("parentId") ? String(formData.get("parentId")) : null;
      scheduledFor = formData.get("scheduledFor")
        ? String(formData.get("scheduledFor"))
        : undefined;
      date = formData.get("date") ? String(formData.get("date")) : undefined;
      time = formData.get("time") ? String(formData.get("time")) : undefined;
      timezone = String(formData.get("timezone") ?? "UTC");
      files = parseChatUploadFiles(formData);
    } else {
      const data = scheduledMessageCreateSchema.parse(await request.json());
      body = data.body ?? "";
      conversationId = data.conversationId;
      parentId = data.parentId ?? null;
      scheduledFor = data.scheduledFor;
      date = data.date;
      time = data.time;
      timezone = data.timezone;
    }

    const parsed = scheduledMessageCreateSchema.parse({
      conversationId,
      body,
      parentId,
      scheduledFor,
      date,
      time,
      timezone,
    });

    const uploadError = validateChatUploadFiles(files);
    if (uploadError) {
      return NextResponse.json({ error: uploadError }, { status: 400 });
    }

    const scheduledMessage = await createScheduledMessage({
      userId: user.id,
      userName: user.name,
      conversationId: parsed.conversationId,
      body: parsed.body ?? "",
      parentId: parsed.parentId,
      scheduledFor: parsed.scheduledFor,
      date: parsed.date,
      time: parsed.time,
      timezone: parsed.timezone,
      files,
    });

    return NextResponse.json({ scheduledMessage }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
