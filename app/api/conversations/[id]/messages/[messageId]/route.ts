import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { updateMessageSchema } from "@/lib/validations";
import { canAccessConversation, canPostToConversation } from "@/lib/chat-access";
import { deleteMessage, getMessageInConversation, updateMessage } from "@/lib/messages";

type RouteContext = { params: Promise<{ id: string; messageId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, messageId } = await context.params;
    if (!(await canAccessConversation(user.id, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!(await canPostToConversation(user.id, id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const msg = await getMessageInConversation(messageId, id);
    if (!msg) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    const { body } = updateMessageSchema.parse(await request.json());
    const message = await updateMessage({
      messageId,
      conversationId: id,
      userId: user.id,
      body,
    });

    return NextResponse.json({ message });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, messageId } = await context.params;
    if (!(await canAccessConversation(user.id, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!(await canPostToConversation(user.id, id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const msg = await getMessageInConversation(messageId, id);
    if (!msg) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    const message = await deleteMessage({
      messageId,
      conversationId: id,
      userId: user.id,
    });

    return NextResponse.json({ message });
  } catch (error) {
    return handleApiError(error);
  }
}
