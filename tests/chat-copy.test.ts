import { describe, expect, it } from "vitest";
import { getMessageCopyText } from "@/lib/chat-copy";
import { plainTextToRichDoc } from "@/lib/rich-message-types";

describe("getMessageCopyText", () => {
  it("returns plain body when no rich doc", () => {
    expect(getMessageCopyText("  Hello world  ", null)).toBe("Hello world");
  });

  it("prefers plain text extracted from bodyJson", () => {
    const doc = plainTextToRichDoc("Rich **ignored** in plain path");
    expect(getMessageCopyText("fallback", doc)).toBe("Rich **ignored** in plain path");
  });

  it("falls back to body when bodyJson is empty", () => {
    expect(getMessageCopyText("Plain only", plainTextToRichDoc("   "))).toBe("Plain only");
  });
});
