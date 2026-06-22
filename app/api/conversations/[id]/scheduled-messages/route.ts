import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { canAccessConversation } from "@/lib/chat-access";
import { listScheduledMessagesForConversation } from "@/lib/scheduled-messages";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const participant = await canAccessConversation(user.id, id);
    if (!participant) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const scheduledMessages = await listScheduledMessagesForConversation(id, user.id);
    return NextResponse.json({ scheduledMessages });
  } catch (error) {
    return handleApiError(error);
  }
}
