import { describe, it, expect } from "vitest";
import { formatChatPushNotification } from "@/lib/chat-push-notification";

describe("formatChatPushNotification", () => {
  it("uses sender name and preview for a single unread message", () => {
    expect(
      formatChatPushNotification({
        unreadCount: 1,
        senderName: "Alice",
        conversationTitle: "Project Alpha",
        preview: "Hey there",
      })
    ).toEqual({
      title: "Alice",
      body: "Hey there",
    });
  });

  it("groups multiple unread messages with count and latest preview", () => {
    expect(
      formatChatPushNotification({
        unreadCount: 3,
        senderName: "Alice",
        conversationTitle: "Project Alpha",
        preview: "Latest update",
      })
    ).toEqual({
      title: "Project Alpha",
      body: "3 new messages\nLatest update",
    });
  });

  it("falls back when preview is empty", () => {
    expect(
      formatChatPushNotification({
        unreadCount: 1,
        senderName: "Bob",
        conversationTitle: "DM",
        preview: "   ",
      })
    ).toEqual({
      title: "Bob",
      body: "New message",
    });
  });

  it("strips markdown markers from push body", () => {
    expect(
      formatChatPushNotification({
        unreadCount: 1,
        senderName: "Seed",
        conversationTitle: "test",
        preview: "**Seed balance changes**\n- **SONI .** `104DH55010140T`",
      })
    ).toEqual({
      title: "Seed",
      body: "Seed balance changes SONI . 104DH55010140T",
    });
  });
});
