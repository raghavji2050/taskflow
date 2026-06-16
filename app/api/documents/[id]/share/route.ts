import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { documentShareSchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { canAccessDocument, canEditDocument } from "@/lib/documents";
import { canPostToConversation } from "@/lib/chat-access";
import { createDirectConversation, getConversationDisplayName } from "@/lib/conversations";
import { sendDocumentShareMessage } from "@/lib/messages";
import { getMessageAudience } from "@/lib/message-audience";
import { defaultDocumentShareBody } from "@/lib/document-ui";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    if (!(await canAccessDocument(user.id, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!(await canEditDocument(user.id, id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = documentShareSchema.parse(await request.json());

    const doc = await prisma.document.findUnique({
      where: { id },
      select: { id: true, title: true, type: true, icon: true },
    });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let conversation: {
      id: string;
      type: import("@prisma/client").ConversationType;
      name: string | null;
      workspace?: { name: string } | null;
      participants: { user: { id: string; name: string } }[];
    };

    if (data.conversationId) {
      const participant = await canPostToConversation(user.id, data.conversationId);
      if (!participant) {
        return NextResponse.json({ error: "Cannot post to this conversation" }, { status: 403 });
      }
      conversation = participant.conversation;
    } else if (data.userId) {
      const created = await createDirectConversation(user.id, data.userId);
      conversation = created;
    } else {
      return NextResponse.json({ error: "Provide conversationId or userId" }, { status: 400 });
    }

    const note = data.body?.trim() ?? "";
    const messageBody = note || defaultDocumentShareBody(doc.title, doc.icon);
    const mentionCandidates = conversation.participants.map((p) => p.user);
    const conversationTitle = getConversationDisplayName(conversation, user.id);

    const message = await sendDocumentShareMessage({
      conversationId: conversation.id,
      userId: user.id,
      userName: user.name ?? "Someone",
      body: messageBody,
      documentId: id,
      conversationTitle,
      mentionCandidates,
    });

    const audience = getMessageAudience(conversation, user.id);

    return NextResponse.json(
      {
        message,
        share: {
          kind: audience.kind,
          title: audience.title,
          sentToLabel: audience.sentToLabel,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
