import type { ChatMessage } from "@/components/chat/MessageBubble";

const MATCH_WINDOW_MS = 60_000;

function serverHasMatchingMessage(server: ChatMessage[], pending: ChatMessage): boolean {
  return server.some((s) => {
    if (s.id === pending.id) return true;
    if (!pending.sendStatus || !pending.clientTempId) return false;
    if (s.user.id !== pending.user.id || s.body !== pending.body) return false;
    const delta = Math.abs(
      new Date(s.createdAt).getTime() - new Date(pending.createdAt).getTime()
    );
    return delta < MATCH_WINDOW_MS;
  });
}

/** Merge a server message list with in-flight optimistic sends and stale-fetch survivors. */
export function mergeMessagesFromFetch(
  prev: ChatMessage[],
  serverMessages: ChatMessage[]
): ChatMessage[] {
  const serverIds = new Set(serverMessages.map((m) => m.id));
  const newestServerMs = serverMessages.reduce(
    (max, m) => Math.max(max, new Date(m.createdAt).getTime()),
    0
  );

  const pending = prev.filter(
    (m) =>
      m.sendStatus &&
      m.clientTempId &&
      !serverHasMatchingMessage(serverMessages, m)
  );

  const staleLocal = prev.filter(
    (m) =>
      !m.sendStatus &&
      !serverIds.has(m.id) &&
      new Date(m.createdAt).getTime() > newestServerMs
  );

  const combined = [...serverMessages, ...pending, ...staleLocal];
  combined.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  return combined;
}

export function replaceSentMessage(
  prev: ChatMessage[],
  clientTempId: string,
  sent: ChatMessage
): ChatMessage[] {
  if (prev.some((m) => m.clientTempId === clientTempId)) {
    return prev.map((m) => (m.clientTempId === clientTempId ? sent : m));
  }
  return [...prev, sent];
}

export function mergeMessageUpdate(existing: ChatMessage, updated: ChatMessage): ChatMessage {
  const localAtt = existing.attachments?.length ?? 0;
  const updatedAtt = updated.attachments?.length ?? 0;
  if (localAtt > 0 && updatedAtt === 0) return existing;
  if (localAtt > updatedAtt) {
    return { ...updated, attachments: existing.attachments };
  }
  return updated;
}
