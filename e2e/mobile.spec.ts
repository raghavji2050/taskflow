import { test, expect, type Page } from "@playwright/test";

// Mobile layouts for List and Calendar. Runs against the throwaway CI MySQL only.
// Own client IP per worker (needs TRUST_TEST_IP_HEADER=1) so these signups do not share the register rate-limit bucket with other specs.
test.use({ extraHTTPHeaders: { "x-test-client-ip": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
test.describe.configure({ mode: "serial", timeout: 120_000 });

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const user = { name: "Mobile E2E", email: `mobile-${stamp}@example.com`, password: "e2e-password-123" };
const created: string[] = [];

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

async function noHorizontalScroll(page: Page) {
  const { sw, w } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  expect(sw).toBeLessThanOrEqual(w);
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto("/register");
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  await page.close();
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await login(page);
  const res = await page.request.get("/api/tasks?archived=all");
  const ids: string[] = res.ok() ? ((await res.json()).tasks ?? []).map((t: { id: string }) => t.id) : created;
  for (const id of new Set([...ids, ...created])) await page.request.delete(`/api/tasks/${id}`);
  await page.close();
});

test("list view: no horizontal scroll, create, open and complete a task", async ({ page }) => {
  await login(page);
  await noHorizontalScroll(page);
  const title = `Mobile task ${stamp} with a fairly long title to check wrapping`;
  await page.getByRole("button", { name: /New Task/ }).first().click();
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Create Task" }).click();
  const row = page.locator(".task-row", { hasText: title });
  await expect(row).toBeVisible();
  await noHorizontalScroll(page);

  // Title gets the full card width on phones (actions sit on their own row).
  const titleBox = await row.locator("h3").boundingBox();
  const actionsBox = await row.getByTestId("task-actions").boundingBox();
  expect(titleBox && actionsBox && actionsBox.y >= titleBox.y + titleBox.height - 1).toBeTruthy();

  // Tap targets are at least 44px.
  for (const name of ["Cycle status", "Edit task", "Archive", "Delete task"]) {
    const box = await row.getByRole("button", { name }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }

  // Open the task
  await row.getByRole("button", { name: "Edit task" }).click();
  await expect(page.getByLabel("Title")).toHaveValue(title);
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Title")).toHaveCount(0);

  // Mark done
  for (let i = 0; i < 3; i++) {
    if (await row.locator("h3.line-through").count()) break;
    await row.getByRole("button", { name: "Cycle status" }).click();
    await page.waitForTimeout(500);
  }
  await expect(row.locator("h3.line-through")).toBeVisible();
});

test("calendar view: mobile agenda, navigate months, tap a due task", async ({ page }) => {
  await login(page);
  const title = `Cal mobile ${stamp}`;
  const due = new Date();
  due.setHours(12, 0, 0, 0);
  const res = await page.request.post("/api/tasks", { data: { title, priority: "HIGH", status: "PENDING", dueDate: due.toISOString() } });
  expect(res.ok()).toBeTruthy();
  created.push((await res.json()).task?.id);

  await page.goto("/dashboard/calendar");
  const agenda = page.getByTestId("calendar-mobile");
  await expect(agenda).toBeVisible();
  await expect(page.locator(".grid-cols-7")).toBeHidden();
  await noHorizontalScroll(page);

  const item = agenda.locator(".agenda-task", { hasText: title });
  await expect(item).toBeVisible();
  expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  const heading = agenda.locator("h2");
  const thisMonth = await heading.textContent();
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(heading).not.toHaveText(thisMonth!);
  await expect(agenda.locator(".agenda-task", { hasText: title })).toHaveCount(0);
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(heading).toHaveText(thisMonth!);

  await agenda.locator(".agenda-task", { hasText: title }).click();
  await expect(page.getByLabel("Title")).toHaveValue(title);
});
