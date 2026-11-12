import { describe, expect, it } from "vitest";
import { clampLimit, etagMatches, weakEtag } from "@/lib/http-cache-rules";
import { cachedJson } from "@/lib/http-cache";

describe("http cache", () => {
  it("weak etag is stable and content-sensitive", () => {
    expect(weakEtag('{"a":1}')).toBe(weakEtag('{"a":1}'));
    expect(weakEtag('{"a":1}')).not.toBe(weakEtag('{"a":2}'));
    expect(weakEtag("x")).toMatch(/^W\/".+"$/);
  });
  it("If-None-Match weak comparison", () => {
    const t = weakEtag("x");
    expect(etagMatches(null, t)).toBe(false);
    expect(etagMatches(t, t)).toBe(true);
    expect(etagMatches(t.replace(/^W\//, ""), t)).toBe(true);
    expect(etagMatches(`"nope", ${t}`, t)).toBe(true);
    expect(etagMatches("*", t)).toBe(true);
    expect(etagMatches('"nope"', t)).toBe(false);
  });
  it("clamps limits", () => {
    expect(clampLimit(null, 500, 1000)).toBe(500);
    expect(clampLimit("abc", 500, 1000)).toBe(500);
    expect(clampLimit("0", 500, 1000)).toBe(500);
    expect(clampLimit("20.7", 500, 1000)).toBe(20);
    expect(clampLimit("5000", 500, 1000)).toBe(1000);
  });
  it("cachedJson returns 304 when the tag matches", async () => {
    const first = cachedJson(new Request("http://x/api"), { ok: 1 });
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("private, no-cache");
    expect(await first.json()).toEqual({ ok: 1 });
    const tag = first.headers.get("etag")!;
    const second = cachedJson(new Request("http://x/api", { headers: { "If-None-Match": tag } }), { ok: 1 });
    expect(second.status).toBe(304);
    const changed = cachedJson(new Request("http://x/api", { headers: { "If-None-Match": tag } }), { ok: 2 });
    expect(changed.status).toBe(200);
  });
});
