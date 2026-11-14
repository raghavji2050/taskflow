import { test, expect } from "@playwright/test";
import { expectCommentXssEscaped, randomIp, register, watchCsp } from "./security-helpers";

test.use({ extraHTTPHeaders: { "x-test-client-ip": randomIp() } });
const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test("phone: comment XSS renders as text without CSP violations", async ({ page }, info) => {
  const violations = watchCsp(page);
  await register(page, "Sec Owner", `sec-m-${info.project.name}-${stamp}@example.com`);
  await expectCommentXssEscaped(page, `${info.project.name}-${stamp}`);
  expect(violations).toEqual([]);
});
