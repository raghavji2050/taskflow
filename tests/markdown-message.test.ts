import { describe, expect, it } from "vitest";
import { looksLikeMarkdown } from "@/lib/markdown-detect";

describe("looksLikeMarkdown", () => {
  it("detects headings and tables", () => {
    expect(
      looksLikeMarkdown(`## Seed balance changes

| Metric | Count |
| --- | --- |
| Changed | 1 |
`)
    ).toBe(true);
  });

  it("ignores plain chat text", () => {
    expect(looksLikeMarkdown("hello there")).toBe(false);
    expect(looksLikeMarkdown("good")).toBe(false);
  });
});
