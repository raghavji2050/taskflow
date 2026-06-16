"use client";

import PusherClient, { type Channel } from "pusher-js";
import { REALTIME_EVENT } from "@/lib/realtime-constants";

const APP_PRESENCE_CHANNEL = "presence-app";

let pusher: PusherClient | null = null;
const workspaceChannels = new Map<string, Channel>();
const presenceChannels = new Map<string, Channel>();
const conversationChannels = new Map<string, Channel>();
const workspaceOnlineById = new Map<string, Set<string>>();
let appOnlineIds = new Set<string>();
let appPresenceChannel: Channel | null = null;
let userChannel: Channel | null = null;
let onRealtimeHandler: ((data: object) => void) | null = null;
let sessionUserId: string | null = null;

export function isPusherClientConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_PUSHER_KEY &&
    process.env.NEXT_PUBLIC_PUSHER_CLUSTER
  );
}

export function getPusherClient(): PusherClient | null {
  if (!isPusherClientConfigured()) return null;
  if (!pusher) {
    pusher = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      authEndpoint: "/api/pusher/auth",
    });
  }
  return pusher;
}

function bindRealtime(channel: Channel) {
  channel.bind(REALTIME_EVENT, (data: object) => {
    onRealtimeHandler?.(data);
  });
  channel.bind("client-typing", (data: {
    conversationId?: string;
    userId?: string;
    typing?: boolean;
    at?: string;
  }) => {
    onRealtimeHandler?.({
      type: "typing:changed",
      conversationId: data.conversationId,
      userId: data.userId,
      typing: data.typing,
      at: data.at,
    });
  });
}

function mergedOnlineIds(): string[] {
  const merged = new Set<string>(appOnlineIds);
  for (const ids of workspaceOnlineById.values()) {
    for (const id of ids) merged.add(id);
  }
  return [...merged];
}

function emitPresenceSync() {
  onRealtimeHandler?.({ type: "presence:sync", onlineUserIds: mergedOnlineIds() });
}

function bindWorkspacePresence(workspaceId: string, presenceChannel: Channel) {
  presenceChannel.bind(
    "pusher:subscription_succeeded",
    (members: { each: (fn: (m: { id: string }) => void) => void }) => {
      const ids = new Set<string>();
      members.each((m) => ids.add(m.id));
      workspaceOnlineById.set(workspaceId, ids);
      emitPresenceSync();
    }
  );
  presenceChannel.bind("pusher:member_added", (member: { id: string }) => {
    const ids = new Set(workspaceOnlineById.get(workspaceId) ?? []);
    ids.add(member.id);
    workspaceOnlineById.set(workspaceId, ids);
    onRealtimeHandler?.({ type: "presence:changed", userId: member.id, online: true });
  });
  presenceChannel.bind("pusher:member_removed", (member: { id: string }) => {
    workspaceOnlineById.get(workspaceId)?.delete(member.id);
    onRealtimeHandler?.({ type: "presence:changed", userId: member.id, online: false });
  });
}

function bindAppPresence(channel: Channel) {
  channel.bind(
    "pusher:subscription_succeeded",
    (members: { each: (fn: (m: { id: string }) => void) => void }) => {
      appOnlineIds = new Set<string>();
      members.each((m) => appOnlineIds.add(m.id));
      emitPresenceSync();
    }
  );
  channel.bind("pusher:member_added", (member: { id: string }) => {
    appOnlineIds.add(member.id);
    onRealtimeHandler?.({ type: "presence:changed", userId: member.id, online: true });
  });
  channel.bind("pusher:member_removed", (member: { id: string }) => {
    appOnlineIds.delete(member.id);
    onRealtimeHandler?.({ type: "presence:changed", userId: member.id, online: false });
  });
}

/** Persist last-seen when the tab closes (works on Vercel without the custom WS server). */
export function reportUserOffline() {
  void fetch("/api/user/presence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ online: false }),
    keepalive: true,
  });
}

export function connectPusher(
  userId: string,
  workspaceIds: string[],
  onRealtime: (data: object) => void,
  onConnectionChange: (connected: boolean) => void
) {
  const client = getPusherClient();
  if (!client) return () => {};

  onRealtimeHandler = onRealtime;
  sessionUserId = userId;

  const handleState = () => {
    onConnectionChange(client.connection.state === "connected");
  };
  client.connection.bind("state_change", handleState);
  client.connection.bind("connected", handleState);
  client.connection.bind("disconnected", handleState);
  handleState();

  userChannel = client.subscribe(`private-user-${userId}`);
  bindRealtime(userChannel);

  if (!appPresenceChannel) {
    appPresenceChannel = client.subscribe(APP_PRESENCE_CHANNEL);
    bindAppPresence(appPresenceChannel);
  }

  for (const workspaceId of workspaceIds) {
    if (workspaceChannels.has(workspaceId)) continue;
    const wsChannel = client.subscribe(`private-workspace-${workspaceId}`);
    bindRealtime(wsChannel);
    workspaceChannels.set(workspaceId, wsChannel);

    const presenceChannel = client.subscribe(`presence-workspace-${workspaceId}`);
    presenceChannels.set(workspaceId, presenceChannel);
    bindWorkspacePresence(workspaceId, presenceChannel);
  }

  return () => {
    onRealtimeHandler = null;
    client.connection.unbind("state_change", handleState);
    client.connection.unbind("connected", handleState);
    client.connection.unbind("disconnected", handleState);

    if (userChannel) {
      client.unsubscribe(`private-user-${userId}`);
      userChannel = null;
    }
    for (const workspaceId of workspaceChannels.keys()) {
      client.unsubscribe(`private-workspace-${workspaceId}`);
    }
    workspaceChannels.clear();
    for (const workspaceId of presenceChannels.keys()) {
      client.unsubscribe(`presence-workspace-${workspaceId}`);
      workspaceOnlineById.delete(workspaceId);
    }
    presenceChannels.clear();

    if (appPresenceChannel) {
      client.unsubscribe(APP_PRESENCE_CHANNEL);
      appPresenceChannel = null;
    }
    appOnlineIds.clear();

    for (const conversationId of conversationChannels.keys()) {
      client.unsubscribe(`private-conversation-${conversationId}`);
    }
    conversationChannels.clear();
  };
}

export function subscribeConversationChannel(conversationId: string) {
  const client = getPusherClient();
  if (!client || conversationChannels.has(conversationId)) return;

  const channel = client.subscribe(`private-conversation-${conversationId}`);
  bindRealtime(channel);
  conversationChannels.set(conversationId, channel);
}

export function unsubscribeConversationChannel(conversationId: string) {
  const client = getPusherClient();
  if (!client || !conversationChannels.has(conversationId)) return;

  client.unsubscribe(`private-conversation-${conversationId}`);
  conversationChannels.delete(conversationId);
}

export function sendPusherTyping(conversationId: string, typing: boolean) {
  const channel = conversationChannels.get(conversationId);
  if (!channel || !sessionUserId) return;
  channel.trigger("client-typing", {
    conversationId,
    userId: sessionUserId,
    typing,
    at: new Date().toISOString(),
  });
}

export function disconnectPusher() {
  if (pusher) {
    pusher.disconnect();
    pusher = null;
  }
  userChannel = null;
  workspaceChannels.clear();
  presenceChannels.clear();
  workspaceOnlineById.clear();
  appPresenceChannel = null;
  appOnlineIds.clear();
  conversationChannels.clear();
  onRealtimeHandler = null;
  sessionUserId = null;
}
