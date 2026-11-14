import { describe, it, expect } from "vitest";
import nextConfig from "../next.config";
import {
  buildContentSecurityPolicy,
  buildSameOriginFrameHeaders,
  buildSecurityHeaders,
} from "@/lib/security-headers";

function toMap(headers: { key: string; value: string }[]) {
  return Object.fromEntries(headers.map((h) => [h.key, h.value]));
}

describe("security headers", () => {
  it("sets the baseline headers", () => {
    const h = toMap(buildSecurityHeaders());
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=()");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });

  it("CSP blocks plugins and base hijacking, allows required origins", () => {
    const csp = buildContentSecurityPolicy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("https://*.blob.vercel-storage.com");
    expect(csp).toContain("wss://*.pusher.com");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("only allows unsafe-eval in dev", () => {
    expect(buildContentSecurityPolicy({ dev: true })).toContain("'unsafe-eval'");
  });

  it("lets the app frame its own attachment previews", () => {
    const h = toMap(buildSameOriginFrameHeaders());
    expect(h["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'self'");
    expect(h["Content-Security-Policy"]).not.toContain("frame-ancestors 'none'");
  });

  it("next.config applies headers to all routes and hides X-Powered-By", async () => {
    expect(nextConfig.poweredByHeader).toBe(false);
    const rules = await nextConfig.headers!();
    expect(rules[0].source).toBe("/:path*");
    expect(toMap(rules[0].headers)["X-Frame-Options"]).toBe("DENY");
    expect(rules.map((r) => r.source)).toEqual(
      expect.arrayContaining(["/api/blob", "/uploads/:path*"])
    );
  });
});
