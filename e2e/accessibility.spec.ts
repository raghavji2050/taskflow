import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
test.use({ extraHTTPHeaders: { "x-test-client-ip": ip() } });

// Runs against a throwaway MySQL database (CI service container). Never prod.
const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const PAGES = ["/dashboard", "/dashboard/my-work", "/dashboard/board", "/dashboard/calendar", "/dashboard/timeline", "/dashboard/team", "/dashboard/goals", "/settings"];

async function violations(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  return r.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.html.slice(0, 120)).join(" | ")}`);
}

for (const [name, viewport, scheme] of [
  ["mobile light", { width: 375, height: 740 }, "light"],
  ["desktop light", { width: 1366, height: 900 }, "light"],
  ["mobile dark", { width: 375, height: 740 }, "dark"],
] as const) {
  test(`no serious axe violations or sideways scroll — ${name}`, async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await browser.newContext({ viewport, colorScheme: scheme, reducedMotion: "reduce", isMobile: viewport.width < 500, hasTouch: viewport.width < 500, extraHTTPHeaders: { "x-test-client-ip": ip() } });
    const page = await ctx.newPage();
    for (const u of ["/login", "/register"]) {
      await page.goto(u);
      expect(await violations(page), u).toEqual([]);
    }
    await page.getByLabel("Name").fill("A11y User");
    await page.getByLabel("Email").fill(`a11y-${name.replace(" ", "-")}-${stamp}@example.com`);
    await page.getByLabel("Password", { exact: true }).fill("e2e-password-123");
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    const ws = (await (await page.request.post("/api/workspaces", { data: { name: `A11y ${stamp}` } })).json()).workspace.id as string;
    await page.request.post("/api/tasks", { data: { title: `A11y task ${stamp}`, priority: "HIGH", status: "PENDING", workspaceId: ws } });
    await page.request.post("/api/tasks", { data: { title: `Undated ${stamp}`, priority: "LOW", status: "IN_PROGRESS", workspaceId: ws } });
    await page.evaluate((w) => localStorage.setItem("taskflow-workspace", w), ws);
    for (const u of PAGES) {
      await page.goto(u);
      expect(await violations(page), u).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${u} horizontal overflow`).toBeLessThanOrEqual(1);
    }
    await ctx.close();
  });
}
