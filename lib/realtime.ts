export type TaskEventType = "task:created" | "task:updated" | "task:deleted" | "task:bulk";

export interface TaskEvent {
  type: TaskEventType;
  workspaceId: string | null;
  ownerId: string;
  actorId: string;
  taskId?: string;
  at: string;
}

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
