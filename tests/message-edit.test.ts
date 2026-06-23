import { describe, expect, it } from "vitest";
import {
  canEditMessage,
  getMessageEditBlockReason,
  isWithinMessageEditWindow,
  messageHasEditableText,
} from "@/lib/message-edit";

const baseMessage = {
  id: "m1",
  createdAt: new Date().toISOString(),
  user: { id: "u1", name: "Raghav" },
  body: "hello",
  bodyJson: null,
  deletedAt: null,
  forwardedFrom: null,
  sharedDocument: null,
  sharedMom: null,
};

describe("messageHasEditableText", () => {
  it("accepts plain body", () => {
    expect(messageHasEditableText({ body: "hi" })).toBe(true);
  });

  it("accepts bodyJson when body is empty", () => {
    expect(
      messageHasEditableText({
        body: "",
        bodyJson: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "rich" }] }],
        },
      })
    ).toBe(true);
  });

  it("rejects empty content", () => {
    expect(messageHasEditableText({ body: "  " })).toBe(false);
  });
});

describe("canEditMessage", () => {
  it("allows own recent text messages", () => {
    expect(canEditMessage(baseMessage, "u1")).toBe(true);
  });

  it("allows editing messages older than one hour", () => {
    const old = {
      ...baseMessage,
      createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    };
    expect(canEditMessage(old, "u1")).toBe(true);
    expect(isWithinMessageEditWindow(old.createdAt)).toBe(true);
  });

  it("blocks forwarded and shared messages", () => {
    expect(
      canEditMessage(
        {
          ...baseMessage,
          forwardedFrom: {
            id: "f1",
            body: "x",
            deleted: false,
            createdAt: baseMessage.createdAt,
            user: { id: "u2", name: "Other" },
            attachments: [],
            sharedDocument: null,
            sourceLabel: "DM",
          },
        },
        "u1"
      )
    ).toBe(false);
  });

  it("returns a helpful reason when edit is blocked", () => {
    expect(getMessageEditBlockReason({ ...baseMessage, body: "" }, "u1")).toBe(
      "This message has no text to edit"
    );
  });
});
