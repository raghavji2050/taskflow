import { describe, expect, it } from "vitest";
import { replaceSentMessage, sortChatMessages } from "@/lib/chat-message-merge";
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

describe("sortChatMessages", () => {
  it("orders by createdAt and breaks ties with id", () => {
    const sameTime = "2026-01-01T12:00:00.000Z";
    const sorted = sortChatMessages([
      msg({ id: "m-f", body: "f", createdAt: sameTime }),
      msg({ id: "m-e", body: "e", createdAt: sameTime }),
      msg({ id: "m-d", body: "d", createdAt: "2026-01-01T11:59:59.000Z" }),
    ]);
    expect(sorted.map((m) => m.body)).toEqual(["d", "e", "f"]);
  });

  it("fixes out-of-order realtime inserts", () => {
    const sorted = sortChatMessages([
      msg({ id: "m-a", body: "a", createdAt: "2026-01-01T12:00:01.000Z" }),
      msg({ id: "m-f", body: "f", createdAt: "2026-01-01T12:00:06.000Z" }),
      msg({ id: "m-b", body: "b", createdAt: "2026-01-01T12:00:02.000Z" }),
      msg({ id: "m-e", body: "e", createdAt: "2026-01-01T12:00:05.000Z" }),
    ]);
    expect(sorted.map((m) => m.body)).toEqual(["a", "b", "e", "f"]);
  });
});

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
