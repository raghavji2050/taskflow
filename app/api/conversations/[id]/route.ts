import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError, jsonError } from "@/lib/api";
import { canAccessConversation } from "@/lib/chat-access";
import { deleteConversationForUser, getConversationById } from "@/lib/conversations";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    if (!(await canAccessConversation(user.id, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const conversation = await getConversationById(id, user.id);
    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ conversation });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    if (!(await canAccessConversation(user.id, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await deleteConversationForUser(user.id, id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Conversation not found" || error.message === "Not a participant") {
        return jsonError("Not found", 404);
      }
      if (error.message === "This conversation cannot be deleted") {
        return jsonError(error.message, 400);
      }
    }
    return handleApiError(error);
  }
}
