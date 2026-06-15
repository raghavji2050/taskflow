import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { canAccessConversation, canPostToConversation } from "@/lib/chat-access";
import { getMessageInConversation, setMessagePinned } from "@/lib/messages";

type RouteContext = { params: Promise<{ id: string; messageId: string }> };

export async function POST(_request: Request, context: RouteContext) {
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

    const message = await setMessagePinned({
      messageId,
      conversationId: id,
      userId: user.id,
      pinned: true,
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

    const message = await setMessagePinned({
      messageId,
      conversationId: id,
      userId: user.id,
      pinned: false,
    });

    return NextResponse.json({ message });
  } catch (error) {
    return handleApiError(error);
  }
}
