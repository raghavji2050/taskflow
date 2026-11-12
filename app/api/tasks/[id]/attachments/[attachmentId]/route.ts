import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api";
import { deleteTaskAttachment } from "@/lib/task-attachments-data";
import { attachmentErrorResponse } from "@/lib/task-attachments-http";

type RouteContext = { params: Promise<{ id: string; attachmentId: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id, attachmentId } = await context.params;
    return NextResponse.json(await deleteTaskAttachment(user.id, id, attachmentId));
  } catch (error) {
    return attachmentErrorResponse(error);
  }
}
