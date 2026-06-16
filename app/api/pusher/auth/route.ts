import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { canAccessConversation } from "@/lib/chat-access";
import { getWorkspaceMembership } from "@/lib/workspace";
import { getPusherServer } from "@/lib/pusher-server";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const pusher = getPusherServer();
    if (!pusher) {
      return NextResponse.json({ error: "Pusher not configured" }, { status: 503 });
    }

    const body = await request.text();
    const params = new URLSearchParams(body);
    const socketId = params.get("socket_id");
    const channelName = params.get("channel_name");

    if (!socketId || !channelName) {
      return NextResponse.json({ error: "Missing socket_id or channel_name" }, { status: 400 });
    }

    const authorized = await authorizeChannel(user.id, channelName);
    if (!authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (channelName.startsWith("presence-")) {
      const auth = pusher.authorizeChannel(socketId, channelName, {
        user_id: user.id,
        user_info: { name: user.name ?? "User" },
      });
      return NextResponse.json(auth);
    }

    const auth = pusher.authorizeChannel(socketId, channelName);
    return NextResponse.json(auth);
  } catch (error) {
    return handleApiError(error);
  }
}

async function authorizeChannel(userId: string, channelName: string): Promise<boolean> {
  if (channelName === `private-user-${userId}`) return true;

  if (channelName.startsWith("private-workspace-")) {
    const workspaceId = channelName.slice("private-workspace-".length);
    const membership = await getWorkspaceMembership(userId, workspaceId);
    return !!membership;
  }

  if (channelName.startsWith("presence-workspace-")) {
    const workspaceId = channelName.slice("presence-workspace-".length);
    const membership = await getWorkspaceMembership(userId, workspaceId);
    return !!membership;
  }

  if (channelName.startsWith("private-conversation-")) {
    const conversationId = channelName.slice("private-conversation-".length);
    const participant = await canAccessConversation(userId, conversationId);
    return !!participant;
  }

  return false;
}
