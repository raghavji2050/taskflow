import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { canAccessConversation } from "@/lib/chat-access";
import {
  addGroupMembers,
  leaveGroupConversation,
  renameGroupConversation,
} from "@/lib/conversations";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  addMemberIds: z.array(z.string()).optional(),
  leave: z.boolean().optional(),
});

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const participant = await canAccessConversation(user.id, id);
    if (!participant) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data = patchSchema.parse(await request.json());

    if (data.leave) {
      await leaveGroupConversation(id, user.id);
      return NextResponse.json({ left: true });
    }
    if (data.name) {
      await renameGroupConversation(id, user.id, data.name);
    }
    if (data.addMemberIds?.length) {
      await addGroupMembers(id, user.id, data.addMemberIds);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
