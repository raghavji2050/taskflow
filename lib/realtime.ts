import {
  isPusherConfigured,
  triggerConversationChannel,
  triggerUserChannel,
  triggerWorkspaceChannel,
} from "@/lib/pusher-server";

export type TaskEventType = "task:created" | "task:updated" | "task:deleted" | "task:bulk" | "comment:created";

export interface TaskEvent {
  type: TaskEventType;
  workspaceId: string | null;
  ownerId: string;
  actorId: string;
  taskId?: string;
  at: string;
}

export interface NotificationEvent {
  type: "notification:new";
  userId: string;
  title?: string;
  body?: string;
  notificationType?: string;
  conversationId?: string;
  messageId?: string;
  at: string;
}

export type WorkspaceUpdateReason =
  | "invite_sent"
  | "invite_accepted"
  | "invite_declined"
  | "invite_revoked"
  | "member_removed"
  | "permissions_updated"
  | "workspace_archived"
  | "workspace_restored";

export interface WorkspaceEvent {
  type: "workspace:updated";
  workspaceId: string;
  reason: WorkspaceUpdateReason;
  actorId: string;
  at: string;
}

export interface WorkspaceMembershipEvent {
  type: "workspace:membership_changed";
  workspaceId: string;
  userId: string;
  at: string;
}

export interface MessageEvent {
  type: "message:created" | "message:updated";
  conversationId: string;
  messageId: string;
  senderId: string;
  preview: string;
  recipientId: string;
  message?: Record<string, unknown>;
  at: string;
}

export interface PresenceSyncEvent {
  type: "presence:sync";
  onlineUserIds: string[];
  at: string;
}

export interface PresenceChangedEvent {
  type: "presence:changed";
  userId: string;
  online: boolean;
  at: string;
}

export interface ConversationReceiptEvent {
  type: "conversation:receipt";
  conversationId: string;
  userId: string;
  lastReadAt?: string;
  lastReceivedAt?: string;
  at: string;
}

export interface TypingChangedEvent {
  type: "typing:changed";
  conversationId: string;
  userId: string;
  typing: boolean;
  at: string;
}

export interface ConversationClearedEvent {
  type: "conversation:cleared";
  conversationId: string;
  userId: string;
  clearedAt: string;
  at: string;
}

export interface ConversationRemovedEvent {
  type: "conversation:removed";
  conversationId: string;
  userId: string;
  at: string;
}

export type TimeEventType = "time:started" | "time:stopped" | "time:updated" | "time:paused" | "time:resumed";

export interface TimeEvent {
  type: TimeEventType;
  workspaceId: string | null;
  taskId: string;
  userId: string;
  actorId: string;
  entry: Record<string, unknown>;
  at: string;
}

export type RealtimeEvent =
  | TaskEvent
  | NotificationEvent
  | WorkspaceEvent
  | WorkspaceMembershipEvent
  | MessageEvent
  | TimeEvent
  | PresenceSyncEvent
  | PresenceChangedEvent
  | ConversationReceiptEvent
  | TypingChangedEvent
  | ConversationClearedEvent
  | ConversationRemovedEvent;

interface RealtimeClient {
  userId: string;
  workspaceIds: string[];
  send: (data: object) => void;
}

class RealtimeHub {
  private clients = new Map<string, RealtimeClient>();
  private presenceSyncTimer: ReturnType<typeof setInterval> | null = null;
  private typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  subscribe(id: string, client: RealtimeClient) {
    const wasOnline = this.isUserOnline(client.userId);
    this.clients.set(id, client);

    client.send({
      type: "presence:sync",
      onlineUserIds: this.getOnlineUserIds(),
      at: new Date().toISOString(),
    } satisfies PresenceSyncEvent);

    if (!wasOnline) {
      this.broadcastPresenceChanged(client.userId, true);
    }
    this.ensurePresenceSyncTimer();
  }

  unsubscribe(id: string) {
    const client = this.clients.get(id);
    if (!client) return;
    const { userId } = client;
    this.clients.delete(id);
    if (!this.isUserOnline(userId)) {
      this.broadcastPresenceChanged(userId, false);
    }
    if (this.clients.size === 0) {
      this.clearPresenceSyncTimer();
    }
  }

  private ensurePresenceSyncTimer() {
    if (this.presenceSyncTimer) return;
    this.presenceSyncTimer = setInterval(() => {
      if (this.clients.size > 0) this.broadcastPresenceSync();
    }, 120_000);
  }

  private clearPresenceSyncTimer() {
    if (!this.presenceSyncTimer) return;
    clearInterval(this.presenceSyncTimer);
    this.presenceSyncTimer = null;
  }

  isUserOnline(userId: string) {
    for (const client of this.clients.values()) {
      if (client.userId === userId) return true;
    }
    return false;
  }

  getOnlineUserIds() {
    return [...new Set([...this.clients.values()].map((c) => c.userId))];
  }

  getOnlineStatus(userIds: string[]) {
    const online: Record<string, boolean> = {};
    for (const id of userIds) {
      online[id] = this.isUserOnline(id);
    }
    return online;
  }

  private broadcastPresenceChanged(userId: string, online: boolean) {
    const event: PresenceChangedEvent = {
      type: "presence:changed",
      userId,
      online,
      at: new Date().toISOString(),
    };
    for (const client of this.clients.values()) {
      try {
        client.send(event);
      } catch {
        // send wrapper handles cleanup
      }
    }
  }

  broadcastPresenceSync() {
    const event: PresenceSyncEvent = {
      type: "presence:sync",
      onlineUserIds: this.getOnlineUserIds(),
      at: new Date().toISOString(),
    };
    for (const client of this.clients.values()) {
      try {
        client.send(event);
      } catch {
        // send wrapper handles cleanup
      }
    }
  }

  publish(event: TaskEvent) {
    for (const client of this.clients.values()) {
      if (this.shouldReceive(client, event)) {
        client.send(event);
      }
    }
  }

  publishToUser(userId: string, event: object) {
    for (const client of this.clients.values()) {
      if (client.userId === userId) {
        client.send(event);
      }
    }
  }

  publishToWorkspace(workspaceId: string, event: object) {
    for (const client of this.clients.values()) {
      if (client.workspaceIds.includes(workspaceId)) {
        client.send(event);
      }
    }
  }

  setTyping(userId: string, conversationId: string, typing: boolean, participantIds: string[]) {
    const key = `${conversationId}:${userId}`;
    const existing = this.typingTimers.get(key);
    if (existing) clearTimeout(existing);
    if (!typing) {
      this.typingTimers.delete(key);
    } else {
      this.typingTimers.set(
        key,
        setTimeout(() => this.setTyping(userId, conversationId, false, participantIds), 4000)
      );
    }
    const event: TypingChangedEvent = {
      type: "typing:changed",
      conversationId,
      userId,
      typing,
      at: new Date().toISOString(),
    };
    for (const participantId of participantIds) {
      if (participantId !== userId) {
        this.publishToUser(participantId, event);
      }
    }
  }

  private shouldReceive(client: RealtimeClient, event: TaskEvent) {
    if (event.workspaceId) {
      return client.workspaceIds.includes(event.workspaceId);
    }
    return client.userId === event.ownerId;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __taskflowRealtimeHub: RealtimeHub | undefined;
}

function getRealtimeHub(): RealtimeHub {
  if (!globalThis.__taskflowRealtimeHub) {
    globalThis.__taskflowRealtimeHub = new RealtimeHub();
  }
  return globalThis.__taskflowRealtimeHub;
}

/** @deprecated Prefer getRealtimeHub() — kept for server.ts and existing imports */
export const realtimeHub = new Proxy({} as RealtimeHub, {
  get(_target, prop: keyof RealtimeHub) {
    const hub = getRealtimeHub();
    const value = hub[prop];
    return typeof value === "function" ? value.bind(hub) : value;
  },
});

export function getOnlineUserIds() {
  return getRealtimeHub().getOnlineUserIds();
}

export function getOnlineStatus(userIds: string[]) {
  return getRealtimeHub().getOnlineStatus(userIds);
}

export function broadcastPresenceSync() {
  getRealtimeHub().broadcastPresenceSync();
}

export function broadcastTaskEvent(
  event: Omit<TaskEvent, "at"> & { at?: string }
) {
  const payload = {
    ...event,
    at: event.at ?? new Date().toISOString(),
  };
  if (event.workspaceId) {
    void triggerWorkspaceChannel(event.workspaceId, payload).then((sent) => {
      if (!sent) getRealtimeHub().publish(payload);
    });
    return;
  }
  getRealtimeHub().publish(payload);
}

export function broadcastNotification(
  userId: string,
  payload?: {
    title?: string;
    body?: string;
    notificationType?: string;
    conversationId?: string;
    messageId?: string;
  }
) {
  const event = {
    type: "notification:new",
    userId,
    title: payload?.title,
    body: payload?.body,
    notificationType: payload?.notificationType,
    conversationId: payload?.conversationId,
    messageId: payload?.messageId,
    at: new Date().toISOString(),
  } satisfies NotificationEvent;

  void triggerUserChannel(userId, event).then((sent) => {
    if (!sent) getRealtimeHub().publishToUser(userId, event);
  });
}

export function broadcastWorkspaceUpdate(params: {
  workspaceId: string;
  reason: WorkspaceUpdateReason;
  actorId: string;
  notifyUserIds?: string[];
}) {
  const at = new Date().toISOString();
  const workspaceEvent = {
    type: "workspace:updated",
    workspaceId: params.workspaceId,
    reason: params.reason,
    actorId: params.actorId,
    at,
  } satisfies WorkspaceEvent;

  void triggerWorkspaceChannel(params.workspaceId, workspaceEvent).then((sent) => {
    if (!sent) getRealtimeHub().publishToWorkspace(params.workspaceId, workspaceEvent);
  });

  for (const userId of params.notifyUserIds ?? []) {
    const membershipEvent = {
      type: "workspace:membership_changed",
      workspaceId: params.workspaceId,
      userId,
      at,
    } satisfies WorkspaceMembershipEvent;
    void triggerUserChannel(userId, membershipEvent).then((sent) => {
      if (!sent) getRealtimeHub().publishToUser(userId, membershipEvent);
    });
  }
}

export function broadcastMessageEvent(
  params: Omit<MessageEvent, "type" | "at"> & { at?: string; type?: MessageEvent["type"] }
) {
  const event = {
    type: params.type ?? "message:created",
    conversationId: params.conversationId,
    messageId: params.messageId,
    senderId: params.senderId,
    preview: params.preview,
    recipientId: params.recipientId,
    message: params.message,
    at: params.at ?? new Date().toISOString(),
  } satisfies MessageEvent;

  void triggerUserChannel(params.recipientId, event).then((sent) => {
    if (!sent) getRealtimeHub().publishToUser(params.recipientId, event);
  });
}

export function broadcastMessageToConversation(
  participantIds: string[],
  params: Omit<MessageEvent, "type" | "at" | "recipientId" | "senderId"> & {
    at?: string;
    type?: MessageEvent["type"];
    actorId: string;
  }
) {
  const at = params.at ?? new Date().toISOString();
  const type = params.type ?? "message:updated";
  for (const recipientId of participantIds) {
    const event = {
      type,
      conversationId: params.conversationId,
      messageId: params.messageId,
      senderId: params.actorId,
      preview: params.preview,
      recipientId,
      message: params.message,
      at,
    } satisfies MessageEvent;
    void triggerUserChannel(recipientId, event).then((sent) => {
      if (!sent) getRealtimeHub().publishToUser(recipientId, event);
    });
  }
}

export function broadcastConversationReceipt(
  participantIds: string[],
  conversationId: string,
  userId: string,
  payload: { lastReadAt?: string; lastReceivedAt?: string }
) {
  const at = new Date().toISOString();
  const event: ConversationReceiptEvent = {
    type: "conversation:receipt",
    conversationId,
    userId,
    lastReadAt: payload.lastReadAt,
    lastReceivedAt: payload.lastReceivedAt,
    at,
  };
  for (const recipientId of participantIds) {
    void triggerUserChannel(recipientId, event).then((sent) => {
      if (!sent) getRealtimeHub().publishToUser(recipientId, event);
    });
  }
}

export function broadcastConversationCleared(
  userId: string,
  conversationId: string,
  clearedAt: Date
) {
  const at = clearedAt.toISOString();
  const event: ConversationClearedEvent = {
    type: "conversation:cleared",
    conversationId,
    userId,
    clearedAt: at,
    at,
  };
  void triggerUserChannel(userId, event).then((sent) => {
    if (!sent) getRealtimeHub().publishToUser(userId, event);
  });
}

export function broadcastConversationRemoved(userId: string, conversationId: string) {
  const at = new Date().toISOString();
  const event: ConversationRemovedEvent = {
    type: "conversation:removed",
    conversationId,
    userId,
    at,
  };
  void triggerUserChannel(userId, event).then((sent) => {
    if (!sent) getRealtimeHub().publishToUser(userId, event);
  });
}

export function setConversationTyping(
  userId: string,
  conversationId: string,
  typing: boolean,
  participantIds: string[]
) {
  if (isPusherConfigured()) {
    const event: TypingChangedEvent = {
      type: "typing:changed",
      conversationId,
      userId,
      typing,
      at: new Date().toISOString(),
    };
    void triggerConversationChannel(conversationId, event);
    return;
  }
  getRealtimeHub().setTyping(userId, conversationId, typing, participantIds);
}

export function broadcastTimeEvent(
  event: Omit<TimeEvent, "at"> & { at?: string }
) {
  const payload = {
    ...event,
    at: event.at ?? new Date().toISOString(),
  } satisfies TimeEvent;

  void triggerUserChannel(event.userId, payload).then((sent) => {
    if (!sent) getRealtimeHub().publishToUser(event.userId, payload);
  });

  if (event.workspaceId) {
    void triggerWorkspaceChannel(event.workspaceId, payload).then((sent) => {
      if (!sent) getRealtimeHub().publishToWorkspace(event.workspaceId!, payload);
    });
  }
}
