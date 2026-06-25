import { describe, expect, it } from "vitest";
import { giphyHasMore, normalizeGiphyItem, normalizeGiphyList } from "@/lib/giphy";

describe("giphy normalization", () => {
  it("maps Giphy API item to preview gif", () => {
    const gif = normalizeGiphyItem({
      id: "abc123",
      title: "Happy dance",
      images: {
        fixed_height: { url: "https://media.giphy.com/fixed.gif", width: "200", height: "150" },
        downsized: { url: "https://media.giphy.com/down.gif" },
      },
    });

    expect(gif).toEqual({
      id: "abc123",
      title: "Happy dance",
      previewUrl: "https://media.giphy.com/fixed.gif",
      width: 200,
      height: 150,
    });
  });

  it("falls back when title is missing", () => {
    const gif = normalizeGiphyItem({
      id: "x",
      images: { preview_gif: { url: "https://media.giphy.com/p.gif" } },
    });
    expect(gif?.title).toBe("GIF");
  });

  it("returns null when no preview url", () => {
    expect(normalizeGiphyItem({ id: "x", images: {} })).toBeNull();
  });

  it("filters invalid items from list", () => {
    const list = normalizeGiphyList([
      { id: "a", images: { fixed_height: { url: "https://a.gif" } } },
      { id: "b", images: {} },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("a");
  });
});

describe("giphy pagination", () => {
  it("detects more pages", () => {
    expect(giphyHasMore(0, 24, 100)).toBe(true);
    expect(giphyHasMore(96, 24, 100)).toBe(false);
    expect(giphyHasMore(0, 0, 100)).toBe(false);
  });
});
