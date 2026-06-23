import { describe, it, expect } from "vitest";
import { emojiOnlySizeClass, isEmojiOnlyMessage } from "@/lib/chat-emoji";
import { getAvatarColorClasses, getInitials } from "@/lib/utils";

describe("chat-emoji", () => {
  it("detects emoji-only messages", () => {
    expect(isEmojiOnlyMessage("😀")).toBe(true);
    expect(isEmojiOnlyMessage("👍❤️")).toBe(true);
    expect(isEmojiOnlyMessage("hello")).toBe(false);
    expect(isEmojiOnlyMessage("hi 😀")).toBe(false);
    expect(isEmojiOnlyMessage("")).toBe(false);
  });

  it("scales emoji sticker size by count", () => {
    expect(emojiOnlySizeClass("😀")).toBe("text-5xl");
    expect(emojiOnlySizeClass("😀👍")).toBe("text-4xl");
  });
});

describe("avatar colors from name", () => {
  it("derives stable initials from full name", () => {
    expect(getInitials("Parveen Kumar")).toBe("PK");
    expect(getInitials("Karan Bhardwaj")).toBe("KB");
  });

  it("returns consistent color classes for the same name", () => {
    expect(getAvatarColorClasses("Parveen Kumar")).toBe(getAvatarColorClasses("Parveen Kumar"));
    expect(getAvatarColorClasses("Parveen Kumar")).not.toBe(getAvatarColorClasses("Karan Bhardwaj"));
  });
});
