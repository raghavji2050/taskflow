import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError, jsonError } from "@/lib/api";
import { canPostToConversation } from "@/lib/chat-access";
import { getConversationDisplayName, getMentionCandidatesForConversation } from "@/lib/conversations";
import { sendGifMessage } from "@/lib/messages";
import { sendGifMessageSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const participant = await canPostToConversation(user.id, id);
    if (!participant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = sendGifMessageSchema.parse(await request.json());
    const conversationTitle = getConversationDisplayName(participant.conversation, user.id);
    const mentionCandidates = await getMentionCandidatesForConversation(participant.conversation);

    const message = await sendGifMessage({
      conversationId: id,
      userId: user.id,
      userName: user.name,
      giphyId: data.giphyId,
      parentId: data.parentId ?? null,
      conversationTitle,
      mentionCandidates,
    });

    return NextResponse.json({ message });
  } catch (error) {
    if (error instanceof Error && error.message === "Giphy is not configured") {
      return jsonError(error.message, 503);
    }
    if (
      error instanceof Error &&
      (error.message === "GIF not found" ||
        error.message === "Failed to download GIF" ||
        error.message === "GIF exceeds size limit")
    ) {
      return jsonError(error.message, 400);
    }
    return handleApiError(error);
  }
}
