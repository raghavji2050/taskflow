"use client";

import PusherClient, { type Channel } from "pusher-js";
import { REALTIME_EVENT } from "@/lib/realtime-constants";

let pusher: PusherClient | null = null;
const workspaceChannels = new Map<string, Channel>();
const presenceChannels = new Map<string, Channel>();
const conversationChannels = new Map<string, Channel>();
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

  for (const workspaceId of workspaceIds) {
    if (workspaceChannels.has(workspaceId)) continue;
    const wsChannel = client.subscribe(`private-workspace-${workspaceId}`);
    bindRealtime(wsChannel);
    workspaceChannels.set(workspaceId, wsChannel);

    const presenceChannel = client.subscribe(`presence-workspace-${workspaceId}`);
    presenceChannels.set(workspaceId, presenceChannel);
    presenceChannel.bind("pusher:subscription_succeeded", (members: { each: (fn: (m: { id: string }) => void) => void }) => {
      const ids: string[] = [];
      members.each((m) => ids.push(m.id));
      onRealtime({ type: "presence:sync", onlineUserIds: ids });
    });
    presenceChannel.bind("pusher:member_added", (member: { id: string }) => {
      onRealtime({ type: "presence:changed", userId: member.id, online: true });
    });
    presenceChannel.bind("pusher:member_removed", (member: { id: string }) => {
      onRealtime({ type: "presence:changed", userId: member.id, online: false });
    });
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
    }
    presenceChannels.clear();

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
  conversationChannels.clear();
  onRealtimeHandler = null;
  sessionUserId = null;
}
