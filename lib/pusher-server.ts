import Pusher from "pusher";
import { REALTIME_EVENT } from "@/lib/realtime-constants";

let pusherInstance: Pusher | null = null;

export function isPusherConfigured(): boolean {
  return !!(
    process.env.PUSHER_APP_ID &&
    process.env.PUSHER_KEY &&
    process.env.PUSHER_SECRET &&
    process.env.PUSHER_CLUSTER
  );
}

export function getPusherServer(): Pusher | null {
  if (!isPusherConfigured()) return null;
  if (!pusherInstance) {
    pusherInstance = new Pusher({
      appId: process.env.PUSHER_APP_ID!,
      key: process.env.PUSHER_KEY!,
      secret: process.env.PUSHER_SECRET!,
      cluster: process.env.PUSHER_CLUSTER!,
      useTLS: true,
    });
  }
  return pusherInstance;
}

export async function triggerUserChannel(userId: string, payload: object) {
  const pusher = getPusherServer();
  if (!pusher) return false;
  await pusher.trigger(`private-user-${userId}`, REALTIME_EVENT, payload);
  return true;
}

export async function triggerWorkspaceChannel(workspaceId: string, payload: object) {
  const pusher = getPusherServer();
  if (!pusher) return false;
  await pusher.trigger(`private-workspace-${workspaceId}`, REALTIME_EVENT, payload);
  return true;
}

export async function triggerConversationChannel(conversationId: string, payload: object) {
  const pusher = getPusherServer();
  if (!pusher) return false;
  await pusher.trigger(`private-conversation-${conversationId}`, REALTIME_EVENT, payload);
  return true;
}
