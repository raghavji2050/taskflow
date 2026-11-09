import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { deleteProjectField } from "@/lib/custom-fields";
import { broadcastTaskEvent } from "@/lib/realtime";

type RouteContext = { params: Promise<{ id: string; fieldId: string }> };

/** Delete a field and every task's value for it. */
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id, fieldId } = await context.params;
    const result = await deleteProjectField(user.id, id, fieldId);
    broadcastTaskEvent({ type: "task:bulk", workspaceId: result.workspaceId, ownerId: user.id, actorId: user.id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
