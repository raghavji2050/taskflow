import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { messageSchema, messagesQuerySchema } from "@/lib/validations";
import { canAccessConversation, canPostToConversation, getConversationParticipantIds } from "@/lib/chat-access";
import { getConversationDisplayName } from "@/lib/conversations";
import {
  addMessageAttachment,
  getMessagesForDate,
  listMessages,
  searchMessages,
  sendMessage,
} from "@/lib/messages";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const participant = await canAccessConversation(user.id, id);
    if (!participant) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const query = messagesQuerySchema.parse({
      cursor: searchParams.get("cursor") || undefined,
      limit: searchParams.get("limit") || undefined,
      search: searchParams.get("search")?.trim() || undefined,
      date: searchParams.get("date") || undefined,
    });

    if (query.search) {
      const results = await searchMessages(id, user.id, query.search, query.limit);
      return NextResponse.json({ results });
    }

    if (query.date) {
      const result = await getMessagesForDate(id, user.id, query.date);
      return NextResponse.json(result);
    }

    const result = await listMessages(id, user.id, query);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const participant = await canPostToConversation(user.id, id);
    if (!participant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { conversation } = participant;
    const contentType = request.headers.get("content-type") ?? "";
    let body = "";
    let parentId: string | null = null;
    let file: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      body = String(formData.get("body") ?? "");
      parentId = formData.get("parentId") ? String(formData.get("parentId")) : null;
      const f = formData.get("file");
      file = f instanceof File && f.size > 0 ? f : null;
    } else {
      const data = messageSchema.parse(await request.json());
      body = data.body ?? "";
      parentId = data.parentId ?? null;
    }

    if (!body.trim() && !file) {
      return NextResponse.json({ error: "Message or attachment required" }, { status: 400 });
    }

    const messageBody = body.trim() || (file ? `📎 ${file.name}` : "");

    let message = await sendMessage({
      conversationId: id,
      userId: user.id,
      userName: user.name,
      body: messageBody,
      parentId,
      conversationTitle: getConversationDisplayName(conversation, user.id),
      mentionCandidates: conversation.participants.map((p) => p.user),
    });

    if (file) {
      const result = await addMessageAttachment({
        messageId: message.id,
        conversationId: id,
        userId: user.id,
        file,
      });
      message = result.message;

      const participantIds = await getConversationParticipantIds(id);
      const { broadcastMessageToConversation } = await import("@/lib/realtime");
      broadcastMessageToConversation(participantIds, {
        conversationId: id,
        messageId: message.id,
        actorId: user.id,
        preview: `📎 ${file.name}`,
        type: "message:updated",
      });
    }

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
