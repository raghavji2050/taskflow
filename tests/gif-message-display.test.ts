import { describe, expect, it } from "vitest";
import { isGifStickerMessage } from "@/lib/attachments";

describe("isGifStickerMessage", () => {
  const gifAttachment = {
    mimeType: "image/gif",
    filename: "giphy-abc.gif",
  };

  it("returns true for single gif with attachment placeholder body", () => {
    expect(isGifStickerMessage("📎 giphy-abc.gif", [gifAttachment])).toBe(true);
  });

  it("returns true for single gif with empty body", () => {
    expect(isGifStickerMessage("", [gifAttachment])).toBe(true);
  });

  it("returns false for multiple attachments", () => {
    expect(
      isGifStickerMessage("📎 giphy-abc.gif", [gifAttachment, { ...gifAttachment, filename: "b.gif" }])
    ).toBe(false);
  });

  it("returns false when body has real text", () => {
    expect(isGifStickerMessage("Check this out", [gifAttachment])).toBe(false);
  });

  it("returns false for non-gif attachment", () => {
    expect(
      isGifStickerMessage("📎 photo.png", [{ mimeType: "image/png", filename: "photo.png" }])
    ).toBe(false);
  });
});
