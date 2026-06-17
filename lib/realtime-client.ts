import type { TaskEvent } from "@/lib/realtime";
import { getActiveConversationId } from "@/lib/active-chat";
import { setRealtimeWebSocket } from "@/lib/realtime-ws-client";

export interface RealtimeWireMessage {
  type: string;
  workspaceId?: string | null;
  actorId?: string;
  ownerId?: string;
  taskId?: string;
  userId?: string;
  online?: boolean;
  onlineUserIds?: string[];
  conversationId?: string;
  senderId?: string;
  messageId?: string;
  message?: Record<string, unknown>;
  lastReadAt?: string;
  lastReceivedAt?: string;
  clearedAt?: string;
  typing?: boolean;
  at?: string;
}

export type RealtimeDispatchContext = {
  sessionUserId?: string;
  markOnline: (userId: string) => void;
  setConnected: (connected: boolean) => void;
  applyOnlineUserIds: (ids: string[], detail?: object) => void;
  applyPresenceChanged: (userId: string, online: boolean) => void;
  onTaskEvent: (event: TaskEvent) => void;
};

export function dispatchRealtimeMessage(
  data: RealtimeWireMessage,
  ctx: RealtimeDispatchContext
) {
  if (data.type === "connected") {
    ctx.setConnected(true);
    return;
  }
  if (data.type === "heartbeat") return;

  if (data.type === "presence:sync" && Array.isArray(data.onlineUserIds)) {
    ctx.applyOnlineUserIds(data.onlineUserIds, data);
    return;
  }
  if (data.type === "presence:changed" && data.userId) {
    ctx.applyPresenceChanged(data.userId, Boolean(data.online));
    return;
  }
  if (data.type === "notification:new") {
    window.dispatchEvent(new CustomEvent("taskflow:notification", { detail: data }));
    return;
  }
  if (data.type === "message:created" || data.type === "message:updated") {
    const senderId = data.senderId;
    if (senderId) ctx.markOnline(senderId);
    if (
      data.type === "message:created" &&
      data.conversationId &&
      senderId &&
      senderId !== ctx.sessionUserId
    ) {
      if (data.conversationId !== getActiveConversationId()) {
        void fetch(`/api/conversations/${data.conversationId}/received`, { method: "PATCH" });
      }
    }
    window.dispatchEvent(new CustomEvent("taskflow:message", { detail: data }));
    return;
  }
  if (data.type === "conversation:receipt" && data.conversationId && data.userId) {
    window.dispatchEvent(new CustomEvent("taskflow:receipt", { detail: data }));
    return;
  }
  if (
    (data.type === "conversation:cleared" || data.type === "conversation:removed") &&
    data.conversationId &&
    data.userId
  ) {
    window.dispatchEvent(new CustomEvent("taskflow:conversation", { detail: data }));
    return;
  }
  if (data.type === "typing:changed" && data.conversationId && data.userId) {
    window.dispatchEvent(new CustomEvent("taskflow:typing", { detail: data }));
    return;
  }
  if (data.type === "workspace:updated" || data.type === "workspace:membership_changed") {
    window.dispatchEvent(
      new CustomEvent("taskflow:workspace", {
        detail: { workspaceId: data.workspaceId, type: data.type },
      })
    );
    return;
  }
  if (data.type?.startsWith("task:") || data.type === "comment:created") {
    ctx.onTaskEvent(data as TaskEvent);
    return;
  }
  if (
    data.type === "time:started" ||
    data.type === "time:stopped" ||
    data.type === "time:updated"
  ) {
    window.dispatchEvent(new CustomEvent("taskflow:time", { detail: data }));
    return;
  }
}
