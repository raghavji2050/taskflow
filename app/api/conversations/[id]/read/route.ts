import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { canAccessConversation } from "@/lib/chat-access";
import { markConversationRead } from "@/lib/messages";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    if (!(await canAccessConversation(user.id, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await markConversationRead(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
