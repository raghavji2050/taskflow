import { describe, expect, it } from "vitest";
import { conversationNavMode } from "@/lib/chat-history";

describe("conversationNavMode", () => {
  it("pushes when opening from the list", () => {
    expect(conversationNavMode(null)).toBe("push");
  });
  it("replaces when switching conversations", () => {
    expect(conversationNavMode("abc")).toBe("replace");
  });
});
