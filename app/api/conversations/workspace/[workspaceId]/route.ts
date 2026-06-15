import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { isWorkspaceMember } from "@/lib/workspace";
import { ensureWorkspaceChannel, getConversationById } from "@/lib/conversations";

type RouteContext = { params: Promise<{ workspaceId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { workspaceId } = await context.params;
    if (!(await isWorkspaceMember(user.id, workspaceId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const channel = await ensureWorkspaceChannel(workspaceId, user.id);
    if (!channel) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    const conversation = await getConversationById(channel.id, user.id);

    return NextResponse.json({ conversation });
  } catch (error) {
    return handleApiError(error);
  }
}
