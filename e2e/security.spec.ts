import { test, expect } from "@playwright/test";
import { expectCommentXssEscaped, randomIp, register, watchCsp } from "./security-helpers";

test.use({ extraHTTPHeaders: { "x-test-client-ip": randomIp() } });
const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test("security headers are sent on pages and API routes", async ({ request }) => {
  for (const path of ["/", "/login", "/api/health"]) {
    const res = await request.get(path);
    const h = res.headers();
    expect(h["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"], path).toContain("object-src 'none'");
    expect(h["x-frame-options"], path).toBe("DENY");
    expect(h["x-content-type-options"], path).toBe("nosniff");
    expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"], path).toContain("camera=()");
    expect(h["x-powered-by"], path).toBeUndefined();
  }
});

test("comment XSS renders as text and pages load without CSP violations", async ({ page }) => {
  const violations = watchCsp(page);
  await page.goto("/");
  await page.goto("/login");
  await register(page, "Sec Owner", `sec-${stamp}@example.com`);
  await expectCommentXssEscaped(page, stamp);
  expect(violations).toEqual([]);
});
