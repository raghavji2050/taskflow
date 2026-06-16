import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forwardMessageSchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { canAccessConversation, canPostToConversation } from "@/lib/chat-access";
import { createDirectConversation, getConversationDisplayName } from "@/lib/conversations";
import { forwardMessage } from "@/lib/messages";
import { messageInclude } from "@/lib/message-format";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = forwardMessageSchema.parse(await request.json());

    const source = await prisma.message.findUnique({
      where: { id: data.sourceMessageId },
      include: messageInclude,
    });
    if (!source) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const sourceAccess = await canAccessConversation(user.id, source.conversationId);
    if (!sourceAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let targetConversationId: string;
    let conversationTitle: string;
    let mentionCandidates: { id: string; name: string }[];

    if (data.conversationId) {
      const participant = await canPostToConversation(user.id, data.conversationId);
      if (!participant) {
        return NextResponse.json({ error: "Cannot post to this conversation" }, { status: 403 });
      }
      targetConversationId = participant.conversation.id;
      conversationTitle = getConversationDisplayName(participant.conversation, user.id);
      mentionCandidates = participant.conversation.participants.map((p) => p.user);
    } else if (data.userId) {
      const created = await createDirectConversation(user.id, data.userId);
      targetConversationId = created.id;
      conversationTitle = getConversationDisplayName(created, user.id);
      mentionCandidates = created.participants.map((p) => p.user);
    } else {
      return NextResponse.json({ error: "Provide conversationId or userId" }, { status: 400 });
    }

    const message = await forwardMessage({
      sourceMessageId: source.id,
      targetConversationId,
      userId: user.id,
      userName: user.name ?? "Someone",
      body: data.body,
      conversationTitle,
      mentionCandidates,
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
