import { describe, it, expect } from "vitest";
import { splitTextWithEmojis } from "@/lib/emoji-text";

describe("splitTextWithEmojis", () => {
  it("splits a single emoji", () => {
    expect(splitTextWithEmojis("🍌")).toEqual([{ type: "emoji", value: "🍌" }]);
  });

  it("keeps plain text intact", () => {
    expect(splitTextWithEmojis("hello")).toEqual([{ type: "text", value: "hello" }]);
  });

  it("splits mixed text and emoji", () => {
    expect(splitTextWithEmojis("hi 😭 there")).toEqual([
      { type: "text", value: "hi " },
      { type: "emoji", value: "😭" },
      { type: "text", value: " there" },
    ]);
  });

  it("splits zwj emoji sequences", () => {
    expect(splitTextWithEmojis("👨‍👩‍👧")).toEqual([{ type: "emoji", value: "👨‍👩‍👧" }]);
  });
});
