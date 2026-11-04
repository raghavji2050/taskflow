import { describe, it, expect, beforeEach } from "vitest";
import { getClientIp, testIpHeaderTrusted } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";

const req = (h: Record<string, string>) => new Request("http://x/api", { headers: h });
const VERCEL = { VERCEL: "1", VERCEL_ENV: "production" };
const LOCAL = {};

describe("getClientIp", () => {
  it("on Vercel prefers x-vercel-forwarded-for over client-spoofable values", () => {
    expect(getClientIp(req({ "x-vercel-forwarded-for": "1.2.3.4", "x-forwarded-for": "6.6.6.6, 1.2.3.4" }), VERCEL)).toBe("1.2.3.4");
  });
  it("on Vercel falls back to x-real-ip then rightmost x-forwarded-for", () => {
    expect(getClientIp(req({ "x-real-ip": "5.5.5.5", "x-forwarded-for": "6.6.6.6" }), VERCEL)).toBe("5.5.5.5");
    expect(getClientIp(req({ "x-forwarded-for": "6.6.6.6, 9.9.9.9" }), VERCEL)).toBe("9.9.9.9");
  });
  it("off Vercel never uses the leftmost (client-supplied) x-forwarded-for", () => {
    expect(getClientIp(req({ "x-forwarded-for": "6.6.6.6, 10.0.0.1" }), LOCAL)).toBe("10.0.0.1");
  });
  it("ignores x-test-client-ip unless flag set and not on Vercel", () => {
    const h = { "x-test-client-ip": "7.7.7.7", "x-real-ip": "1.1.1.1" };
    expect(getClientIp(req(h), LOCAL)).toBe("1.1.1.1");
    expect(getClientIp(req(h), { TRUST_TEST_IP_HEADER: "1" })).toBe("7.7.7.7");
    expect(getClientIp(req(h), { ...VERCEL, TRUST_TEST_IP_HEADER: "1" })).toBe("1.1.1.1");
    expect(testIpHeaderTrusted({ TRUST_TEST_IP_HEADER: "1", VERCEL_ENV: "preview" })).toBe(false);
  });
});

describe("spoofed x-forwarded-for cannot bypass rate limit", () => {
  let n = 0;
  beforeEach(() => { n++; });
  it("on Vercel: rotating leftmost XFF still hits the same bucket", () => {
    const results = Array.from({ length: 7 }, (_, i) =>
      rateLimit(`register-test-${n}:${getClientIp(req({ "x-vercel-forwarded-for": "1.2.3.4", "x-forwarded-for": `10.0.0.${i}, 1.2.3.4` }), VERCEL)}`, 5, 300_000));
    expect(results.filter(Boolean)).toHaveLength(5);
    expect(results.slice(5)).toEqual([false, false]);
  });
  it("off Vercel: rotating leftmost XFF behind a proxy still hits the same bucket", () => {
    const results = Array.from({ length: 7 }, (_, i) =>
      rateLimit(`login-test-${n}:${getClientIp(req({ "x-forwarded-for": `10.0.0.${i}, 203.0.113.9` }), LOCAL)}`, 5, 300_000));
    expect(results.slice(5)).toEqual([false, false]);
  });
  it("x-test-client-ip header is ignored in production-like env", () => {
    const results = Array.from({ length: 7 }, (_, i) =>
      rateLimit(`forgot-test-${n}:${getClientIp(req({ "x-test-client-ip": `10.1.0.${i}`, "x-vercel-forwarded-for": "1.2.3.4" }), { ...VERCEL, TRUST_TEST_IP_HEADER: "1" })}`, 5, 300_000));
    expect(results.slice(5)).toEqual([false, false]);
  });
});
