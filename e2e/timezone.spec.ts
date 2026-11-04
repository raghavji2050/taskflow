import { test, expect, type Page } from "@playwright/test";

// A due time early in the IST morning is the previous day in UTC. List, desktop
// calendar grid and mobile agenda must all put it on the same (IST) day.
test.use({ timezoneId: "Asia/Kolkata" });
// Own client IP per worker so these signups do not share the register rate-limit bucket with other specs.
test.use({ extraHTTPHeaders: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
test.describe.configure({ mode: "serial", timeout: 120_000 });

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const user = { name: "TZ E2E", email: `tz-${stamp}@example.com`, password: "e2e-password-123" };
const title = `IST early task ${stamp}`;
let taskId = "";

// Today in IST at 05:00 = 23:30 UTC on the previous day.
const istNow = new Date(Date.now() + 330 * 60_000);
const istY = istNow.getUTCFullYear(), istM = istNow.getUTCMonth(), istD = istNow.getUTCDate();
const dueIso = new Date(Date.UTC(istY, istM, istD, 5, 0) - 330 * 60_000).toISOString();

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto("/register");
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  const res = await page.request.post("/api/tasks", { data: { title, priority: "HIGH", status: "PENDING", dueDate: dueIso } });
  expect(res.ok()).toBeTruthy();
  taskId = (await res.json()).task.id;
  await page.close();
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await login(page);
  if (taskId) await page.request.delete(`/api/tasks/${taskId}`);
  await page.close();
});

test("list says Today and desktop grid shows it on today's cell", async ({ page }) => {
  await login(page);
  const row = page.locator(".task-row", { hasText: title });
  await expect(row).toContainText("Today at 5:00 AM");
  await page.goto("/dashboard/calendar");
  const todayCell = page.locator(".grid-cols-7 button[data-today=true]");
  await expect(todayCell).toContainText(title.slice(0, 10));
});

test("mobile agenda lists it under Today", async ({ browser }) => {
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "10.251.1.1" }, timezoneId: "Asia/Kolkata", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await login(page);
  await page.goto("/dashboard/calendar");
  const todayGroup = page.getByTestId("agenda-day").filter({ hasText: "Today ·" });
  await expect(todayGroup.locator(".agenda-task", { hasText: title })).toBeVisible();
  await ctx.close();
});
