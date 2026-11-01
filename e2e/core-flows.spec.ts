import { test, expect, type Page } from "@playwright/test";

// Runs against a throwaway MySQL database (CI service container). Never prod.
test.describe.configure({ mode: "serial" });

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const user = {
  name: "E2E User",
  email: `e2e-${stamp}@example.com`,
  password: "e2e-password-123",
};

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

test("signup creates an account and lands on the dashboard", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
});

test("login, then create, edit, complete, trash and restore a task", async ({ page }) => {
  await login(page);
  const title = `E2E task ${stamp}`;
  const edited = `${title} edited`;

  // Create
  await page.getByRole("button", { name: /New Task/ }).first().click();
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Create Task" }).click();
  const row = () => page.locator(".task-row", { hasText: edited }).or(page.locator(".task-row", { hasText: title })).first();
  await expect(page.locator(".task-row", { hasText: title })).toBeVisible();

  // Edit
  await row().getByRole("button", { name: "Edit task" }).click();
  await page.getByLabel("Title").fill(edited);
  await page.getByRole("button", { name: "Update Task" }).click();
  await expect(page.locator(".task-row", { hasText: edited })).toBeVisible();

  // Complete (cycle status until completed)
  const editedRow = page.locator(".task-row", { hasText: edited });
  for (let i = 0; i < 3; i++) {
    if (await editedRow.locator("h3.line-through").count()) break;
    await editedRow.getByRole("button", { name: "Cycle status" }).click();
    await page.waitForTimeout(500);
  }
  await expect(editedRow.locator("h3.line-through")).toBeVisible();

  // Delete to trash
  await editedRow.locator("button.text-red-500").click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete Task" }).click();
  await expect(page.locator(".task-row", { hasText: edited })).toHaveCount(0);

  // Restore from trash
  await page.goto("/dashboard/trash");
  const item = page.locator("li", { hasText: edited });
  await expect(item).toBeVisible();
  await expect(item).toContainText(/Deletes on \w{3} \d{1,2}, \d{4}/);
  await item.getByRole("button", { name: "Restore" }).click();
  await expect(page.locator("li", { hasText: edited })).toHaveCount(0);

  await page.goto("/dashboard");
  await expect(page.locator(".task-row", { hasText: edited })).toBeVisible();
});

test("Hinglish quick-add parses date, time and priority from the title", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: /New Task/ }).first().click();
  await page.getByLabel("Title").fill(`kal 5 baje client call ${stamp} !high`);
  const preview = page.getByTestId("quick-add-preview");
  await expect(preview).toContainText(`client call ${stamp}`);
  await expect(preview).toContainText("Kal");
  await expect(preview).toContainText("5:00 PM");
  await expect(preview).toContainText("High priority");
  await page.getByRole("button", { name: "Create Task" }).click();
  const row = page.locator(".task-row", { hasText: `client call ${stamp}` });
  await expect(row).toBeVisible();
  await expect(row).not.toContainText("kal 5 baje");
});
