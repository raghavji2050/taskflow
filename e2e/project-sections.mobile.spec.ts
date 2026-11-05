import { test, expect, type Page } from "@playwright/test";

// Phone: sections can be managed and tasks moved without drag & drop. Throwaway DB only.
test.use({ extraHTTPHeaders: { "x-test-client-ip": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
test.describe.configure({ mode: "serial", timeout: 120_000 });

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const user = { name: "Sections Mobile", email: `psecm-${stamp}@example.com`, password: "e2e-password-123" };

const section = (page: Page, name: string) =>
  page.locator("section[data-section-id]").filter({ has: page.getByRole("heading", { name, exact: true }) });

test("phone: add section, quick-add, move task via menu, collapse", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  const ws = await page.request.post("/api/workspaces", { data: { name: `Sections M ${stamp}` } });
  const workspaceId = (await ws.json()).workspace.id;
  const pr = await page.request.post(`/api/workspaces/${workspaceId}/projects`, { data: { name: `QA M ${stamp}` } });
  const projectId = (await pr.json()).project.id;

  await page.goto(`/dashboard/projects/${projectId}`);
  await page.getByRole("tab", { name: "List" }).click();
  await page.getByPlaceholder("New section").fill("Later");
  await page.getByRole("button", { name: "Add section" }).click();
  await expect(section(page, "Later")).toBeVisible({ timeout: 20_000 });

  const quick = section(page, "To do").locator('[data-testid^="section-quick-add-"]');
  await quick.getByLabel("Add task").fill(`Phone task ${stamp}`);
  await quick.getByLabel("Add task").press("Enter");
  const card = page.getByTestId("project-task-card").filter({ hasText: `Phone task ${stamp}` });
  await expect(card).toBeVisible({ timeout: 20_000 });

  const moved = page.waitForResponse((r) => r.url().includes("/tasks/move"));
  await card.getByLabel(`Move Phone task ${stamp} to section`).selectOption({ label: "Later" });
  expect((await moved).ok()).toBeTruthy();
  await expect(section(page, "Later").getByTestId("project-task-card")).toHaveCount(1);

  await section(page, "Later").getByRole("button", { name: "Collapse section" }).click();
  await expect(card).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  if (process.env.E2E_PROOF_DIR) await page.screenshot({ path: `${process.env.E2E_PROOF_DIR}/qa-mobile-sections-${test.info().project.name}.png`, fullPage: true });
});
