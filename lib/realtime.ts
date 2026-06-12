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
  at: string;
}

export type WorkspaceUpdateReason =
  | "invite_sent"
  | "invite_accepted"
  | "invite_declined"
  | "invite_revoked"
  | "member_removed"
  | "permissions_updated";

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

export type RealtimeEvent = TaskEvent | NotificationEvent | WorkspaceEvent | WorkspaceMembershipEvent;

interface RealtimeClient {
  userId: string;
  workspaceIds: string[];
  send: (data: object) => void;
}

class RealtimeHub {
  private clients = new Map<string, RealtimeClient>();

  subscribe(id: string, client: RealtimeClient) {
    this.clients.set(id, client);
  }

  unsubscribe(id: string) {
    this.clients.delete(id);
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

export const realtimeHub = globalThis.__taskflowRealtimeHub ?? new RealtimeHub();
globalThis.__taskflowRealtimeHub = realtimeHub;

export function broadcastTaskEvent(
  event: Omit<TaskEvent, "at"> & { at?: string }
) {
  realtimeHub.publish({
    ...event,
    at: event.at ?? new Date().toISOString(),
  });
}

export function broadcastNotification(userId: string) {
  realtimeHub.publishToUser(userId, {
    type: "notification:new",
    userId,
    at: new Date().toISOString(),
  });
}

export function broadcastWorkspaceUpdate(params: {
  workspaceId: string;
  reason: WorkspaceUpdateReason;
  actorId: string;
  notifyUserIds?: string[];
}) {
  const at = new Date().toISOString();
  realtimeHub.publishToWorkspace(params.workspaceId, {
    type: "workspace:updated",
    workspaceId: params.workspaceId,
    reason: params.reason,
    actorId: params.actorId,
    at,
  } satisfies WorkspaceEvent);

  for (const userId of params.notifyUserIds ?? []) {
    realtimeHub.publishToUser(userId, {
      type: "workspace:membership_changed",
      workspaceId: params.workspaceId,
      userId,
      at,
    } satisfies WorkspaceMembershipEvent);
  }
}
