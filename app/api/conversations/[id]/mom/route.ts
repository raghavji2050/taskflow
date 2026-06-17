import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { canPostToConversation } from "@/lib/chat-access";
import { getConversationDisplayName } from "@/lib/conversations";
import { createMeetingMinutes } from "@/lib/meeting-minutes";
import { coerceMomStructuredContent } from "@/lib/mom-structured";
import { momCreateSchema } from "@/lib/validations";

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

    const { conversation } = participant;
    const data = momCreateSchema.parse(await request.json());

    const result = await createMeetingMinutes({
      conversationId: id,
      userId: user.id,
      userName: user.name ?? "Someone",
      title: data.title,
      startedAt: data.startedAt,
      endedAt: data.endedAt,
      content: coerceMomStructuredContent(data.content),
      note: data.note,
      attendeeUserIds: data.attendeeUserIds,
      allAttendees: data.allAttendees,
      conversationTitle: getConversationDisplayName(conversation, user.id),
      mentionCandidates: conversation.participants.map((p) => p.user),
      workspaceId: conversation.workspaceId,
      conversationType: conversation.type,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
