import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  extractUrlsFromMessage,
  fetchLinkPreview,
  isBlockedPreviewHost,
  normalizePreviewUrl,
  parsePreviewUrl,
  pickPreviewUrl,
  pickPreviewUrlFromMessage,
  shouldUnfurlUrl,
} from "@/lib/link-preview";

describe("link-preview utils", () => {
  it("extractUrlsFromMessage collects plain text and link marks", () => {
    const body = "See https://example.com/page and https://other.test";
    const bodyJson = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "click here",
              marks: [{ type: "link", attrs: { href: "https://marked.dev" } }],
            },
          ],
        },
      ],
    };

    const urls = extractUrlsFromMessage(body, bodyJson);
    expect(urls).toContain("https://example.com/page");
    expect(urls).toContain("https://other.test");
    expect(urls).toContain("https://marked.dev");
  });

  it("shouldUnfurlUrl blocks localhost and direct images", () => {
    expect(shouldUnfurlUrl("http://localhost/secret")).toBe(false);
    expect(shouldUnfurlUrl("https://127.0.0.1/admin")).toBe(false);
    expect(shouldUnfurlUrl("https://example.com/photo.png")).toBe(false);
    expect(shouldUnfurlUrl("mailto:test@example.com")).toBe(false);
    expect(shouldUnfurlUrl("https://example.com/article")).toBe(true);
  });

  it("shouldUnfurlUrl skips attachment URLs", () => {
    expect(
      shouldUnfurlUrl("https://cdn.example.com/file.pdf", {
        attachmentUrls: ["https://cdn.example.com/file.pdf"],
      })
    ).toBe(false);
  });

  it("pickPreviewUrl returns first eligible URL", () => {
    expect(
      pickPreviewUrl([
        "http://127.0.0.1/x",
        "https://blocked.test/image.jpg",
        "https://good.example.com/post",
      ])
    ).toBe("https://good.example.com/post");
  });

  it("pickPreviewUrlFromMessage picks from message content", () => {
    expect(
      pickPreviewUrlFromMessage("Check https://github.com out", null)
    ).toBe("https://github.com/");
  });

  it("normalizePreviewUrl strips hash", () => {
    expect(normalizePreviewUrl("https://example.com/path#section")).toBe(
      "https://example.com/path"
    );
  });

  it("isBlockedPreviewHost blocks private IPv4 ranges", () => {
    expect(isBlockedPreviewHost("192.168.1.5")).toBe(true);
    expect(isBlockedPreviewHost("10.0.0.1")).toBe(true);
    expect(isBlockedPreviewHost("example.com")).toBe(false);
  });

  it("parsePreviewUrl rejects non-http protocols", () => {
    expect(parsePreviewUrl("ftp://example.com")).toBeNull();
    expect(parsePreviewUrl("https://example.com")).not.toBeNull();
  });
});

describe("fetchLinkPreview", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        body: null,
        text: async () =>
          `<html><head>
            <meta property="og:title" content="GitHub" />
            <meta property="og:description" content="Where the world builds software" />
            <meta property="og:image" content="https://github.com/opengraph.png" />
          </head></html>`,
      }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses OG tags from HTML", async () => {
    const preview = await fetchLinkPreview("https://github.com");
    expect(preview.url).toBe("https://github.com/");
    expect(preview.title).toBe("GitHub");
    expect(preview.description).toBe("Where the world builds software");
    expect(preview.image).toBe("https://github.com/opengraph.png");
  });
});
