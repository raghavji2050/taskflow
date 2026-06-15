import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { messageReactionSchema } from "@/lib/validations";
import { canAccessConversation, canPostToConversation } from "@/lib/chat-access";
import { getMessageInConversation, toggleMessageReaction } from "@/lib/messages";

type RouteContext = { params: Promise<{ id: string; messageId: string }> };

export async function POST(request: Request, context: RouteContext) {
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

    const { emoji } = messageReactionSchema.parse(await request.json());
    const message = await toggleMessageReaction({
      messageId,
      conversationId: id,
      userId: user.id,
      emoji,
    });

    const { broadcastMessageToConversation } = await import("@/lib/realtime");
    const { getConversationParticipantIds } = await import("@/lib/chat-access");
    const participantIds = await getConversationParticipantIds(id);
    broadcastMessageToConversation(participantIds, {
      conversationId: id,
      messageId,
      actorId: user.id,
      preview: `${emoji} reaction`,
      type: "message:updated",
    });

    return NextResponse.json({ message });
  } catch (error) {
    return handleApiError(error);
  }
}
