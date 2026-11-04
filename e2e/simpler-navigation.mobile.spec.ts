import { test, expect, type Page } from "@playwright/test";

// Mobile: slim drawer with projects, scrollable view tabs, quick-add, tap-to-open. Throwaway CI MySQL only.
test.use({ extraHTTPHeaders: { "x-test-client-ip": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
test.describe.configure({ mode: "serial", timeout: 120_000 });

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const user = { name: "Nav Mobile", email: `navm-${stamp}@example.com`, password: "e2e-password-123" };
let projectId = "";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

async function openDrawer(page: Page) {
  await expect(async () => {
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.locator("#mobile-sidebar-drawer")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
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
  const ws = await page.request.post("/api/workspaces", { data: { name: `Mobile WS ${stamp}` } });
  const workspaceId = (await ws.json()).workspace.id;
  const pr = await page.request.post(`/api/workspaces/${workspaceId}/projects`, { data: { name: `App ${stamp}` } });
  projectId = (await pr.json()).project.id;
  await page.close();
});

test("drawer is short, lists projects, and the view tabs fit the phone", async ({ page }) => {
  await login(page);
  await expect(page.getByTestId("task-view-tabs")).toBeVisible();
  await noHorizontalScroll(page);

  const drawer = page.locator("#mobile-sidebar-drawer");
  await openDrawer(page);
  await expect(drawer.getByRole("link", { name: "My Tasks" })).toBeVisible();
  // Board is only a tab now, never a drawer item.
  await expect(page.locator(".sidebar-nav-item", { hasText: "Board" })).toHaveCount(0);

  // Switch to the workspace from the drawer: its project then shows in the drawer.
  await drawer.getByRole("button", { name: /Personal/ }).first().click();
  await page.getByText(`Mobile WS ${stamp}`).filter({ visible: true }).last().click();
  if (!(await drawer.isVisible())) await openDrawer(page);
  const projectLink = drawer.getByRole("link", { name: `App ${stamp}` });
  await expect(projectLink).toBeVisible({ timeout: 20_000 });
  await projectLink.click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/projects/${projectId}`));
});

test("quick-add in a section, then tap the card to open it", async ({ page }) => {
  await login(page);
  await page.goto(`/dashboard/projects/${projectId}`);
  const quick = page.locator('[data-testid^="section-quick-add-"]').first();
  await expect(quick).toBeVisible({ timeout: 20_000 });
  await quick.getByLabel("Add task").fill(`parso shaam 6 review ${stamp}`);
  await quick.getByLabel("Add task").press("Enter");
  const card = page.getByTestId("project-task-card").filter({ hasText: `review ${stamp}` });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByText("MEDIUM").tap();
  await expect(page.getByRole("dialog")).toBeVisible();
  await noHorizontalScroll(page);
});

test("list quick-add and tap a row to open", async ({ page }) => {
  await login(page);
  await page.goto("/dashboard");
  const quick = page.getByTestId("quick-add-task");
  await quick.getByLabel("Add task").fill(`Phone task ${stamp}`);
  await quick.getByLabel("Add task").press("Enter");
  const row = page.locator(".task-row", { hasText: `Phone task ${stamp}` });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole("heading", { name: `Phone task ${stamp}` }).tap();
  await expect(page.getByRole("dialog")).toBeVisible();
});
