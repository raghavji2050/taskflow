import { describe, expect, it } from "vitest";
import { replaceSentMessage } from "@/lib/chat-message-merge";
import type { ChatMessage } from "@/components/chat/MessageBubble";

function msg(
  partial: Partial<ChatMessage> & Pick<ChatMessage, "id" | "body">
): ChatMessage {
  return {
    createdAt: "2026-01-01T12:00:00.000Z",
    user: { id: "u1", name: "You", image: null },
    ...partial,
  };
}

describe("replaceSentMessage", () => {
  it("replaces optimistic temp with server message", () => {
    const tempId = "temp-abc";
    const sent = msg({ id: "real-1", body: "hello" });
    const prev = [
      msg({
        id: tempId,
        clientTempId: tempId,
        body: "hello",
        sendStatus: "sending",
      }),
    ];
    const next = replaceSentMessage(prev, tempId, sent);
    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe("real-1");
  });

  it("dedupes when realtime already added the server message", () => {
    const tempId = "temp-abc";
    const sent = msg({ id: "real-1", body: "hello" });
    const prev = [
      msg({
        id: tempId,
        clientTempId: tempId,
        body: "hello",
        sendStatus: "sending",
      }),
      msg({ id: "real-1", body: "hello" }),
    ];
    const next = replaceSentMessage(prev, tempId, sent);
    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe("real-1");
  });
});
