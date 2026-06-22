import { describe, it, expect } from "vitest";
import {
  plainTextFromBodyJson,
  sanitizeBodyJson,
  validateBodyJson,
  isEmptyRichDoc,
  hasRichFormatting,
} from "@/lib/rich-message-serialize";
import { sanitizeLinkHref } from "@/lib/rich-message-links";
import type { RichMessageDoc } from "@/lib/rich-message-types";

describe("rich-message-serialize", () => {
  it("extracts plain text with mentions", () => {
    const doc: RichMessageDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello " },
            { type: "mention", attrs: { id: "u1", label: "Rahul" } },
            { type: "text", text: "!" },
          ],
        },
      ],
    };
    expect(plainTextFromBodyJson(doc)).toBe("Hello @Rahul!");
  });

  it("sanitizes malicious link marks", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "click",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
      ],
    };
    const sanitized = sanitizeBodyJson(doc);
    const text = sanitized?.content?.[0]?.content?.[0];
    expect(text?.marks?.length ?? 0).toBe(0);
  });

  it("rejects unknown node types", () => {
    const doc = { type: "doc", content: [{ type: "script", content: [] }] };
    expect(sanitizeBodyJson(doc)?.content?.length ?? 0).toBe(0);
  });

  it("caps oversized code blocks", () => {
    const huge = "x".repeat(25_000);
    const doc = {
      type: "doc",
      content: [{ type: "codeBlock", attrs: { language: "typescript" }, content: [{ type: "text", text: huge }] }],
    };
    const sanitized = sanitizeBodyJson(doc);
    const code = sanitized?.content?.[0]?.content?.[0]?.text ?? "";
    expect(code.length).toBeLessThanOrEqual(20_000);
  });

  it("detects empty and rich docs", () => {
    const empty: RichMessageDoc = { type: "doc", content: [{ type: "paragraph" }] };
    expect(isEmptyRichDoc(empty)).toBe(true);
    expect(hasRichFormatting(empty)).toBe(false);

    const rich: RichMessageDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "bold", marks: [{ type: "bold" }] }],
        },
      ],
    };
    expect(hasRichFormatting(rich)).toBe(true);
  });
});

describe("rich-message-links", () => {
  it("allows https and blocks javascript", () => {
    expect(sanitizeLinkHref("https://example.com")).toBe("https://example.com");
    expect(sanitizeLinkHref("javascript:alert(1)")).toBeNull();
  });
});
