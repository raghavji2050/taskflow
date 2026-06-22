import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { canAccessConversation, getConversationParticipantIds } from "@/lib/chat-access";
import { setConversationTyping } from "@/lib/realtime";
import { typingSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const participant = await canAccessConversation(user.id, id);
    if (!participant) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { typing } = typingSchema.parse(await request.json());
    const participantIds = await getConversationParticipantIds(id);
    setConversationTyping(user.id, id, typing, participantIds);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
