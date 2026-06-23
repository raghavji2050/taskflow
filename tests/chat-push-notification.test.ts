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

  it("uses sender as conversation title fallback when grouping", () => {
    expect(
      formatChatPushNotification({
        unreadCount: 2,
        senderName: "Carol",
        conversationTitle: "",
        preview: "Hi",
      })
    ).toEqual({
      title: "Carol",
      body: "2 new messages\nHi",
    });
  });
});
