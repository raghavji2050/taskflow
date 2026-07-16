import { plainMessagePreview } from "@/lib/markdown-plain";

const CHAT_PUSH_COUNT_KEY = "taskflow:chat-push-count";

export function formatChatPushNotification(params: {
  unreadCount: number;
  senderName: string;
  conversationTitle: string;
  preview: string;
}): { title: string; body: string } {
  // OS notifications are plain text — strip markdown so **bold** / `code` don't show raw.
  const preview = plainMessagePreview(params.preview ?? "", 180);
  const conversationTitle = params.conversationTitle?.trim() || params.senderName;

  if (params.unreadCount <= 1) {
    return {
      title: params.senderName,
      body: preview,
    };
  }

  return {
    title: conversationTitle,
    body: `${params.unreadCount} new messages\n${preview}`,
  };
}

function readCountMap(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(CHAT_PUSH_COUNT_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeCountMap(map: Record<string, number>) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(CHAT_PUSH_COUNT_KEY, JSON.stringify(map));
}

/** Client fallback: bump per-conversation count while tab is hidden without push. */
export function bumpChatNotificationCount(conversationId: string): number {
  const map = readCountMap();
  const next = (map[conversationId] ?? 0) + 1;
  map[conversationId] = next;
  writeCountMap(map);
  return next;
}

/** Reset when user opens a conversation so the next burst starts at 1. */
export function clearChatNotificationCount(conversationId: string | null) {
  if (typeof window === "undefined") return;
  if (!conversationId) {
    sessionStorage.removeItem(CHAT_PUSH_COUNT_KEY);
    return;
  }
  const map = readCountMap();
  if (!(conversationId in map)) return;
  delete map[conversationId];
  writeCountMap(map);
}
