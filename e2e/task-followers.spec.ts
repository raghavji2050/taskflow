import { test, expect, type Page } from "@playwright/test";

// Runs against a throwaway MySQL database (CI service container). Never prod.
const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function register(page: Page, name: string, email: string) {
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("e2e-password-123");
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

test("follow and unfollow a task; strangers can't follow it", async ({ page, browser }) => {
  await register(page, "Follow Owner", `follow-${stamp}@example.com`);

  const created = await page.request.post("/api/tasks", {
    data: { title: `Follow me ${stamp}`, priority: "MEDIUM", status: "PENDING" },
  });
  expect(created.status()).toBe(201);
  const taskId = (await created.json()).task.id as string;

  // Commenting auto-follows the author.
  const before = await page.request.get(`/api/tasks/${taskId}/followers`);
  expect((await before.json()).following).toBe(false);
  await page.request.post(`/api/tasks/${taskId}/comments`, { data: { body: "first note" } });
  const afterComment = await (await page.request.get(`/api/tasks/${taskId}/followers`)).json();
  expect(afterComment.following).toBe(true);
  expect(afterComment.followers).toHaveLength(1);

  // UI: the task side panel (one scroll) shows the follower and toggles Unfollow/Follow.
  await page.goto("/dashboard");
  const row = page.locator(".task-row", { hasText: `Follow me ${stamp}` }).first();
  await row.getByRole("button", { name: "Edit task" }).click();
  const box = page.getByTestId("task-followers");
  await expect(box).toContainText("1 follower: Follow Owner");
  await box.getByRole("button", { name: "Unfollow", exact: true }).click();
  await expect(box).toContainText("No followers yet");
  await box.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(box).toContainText("1 follower");

  // Someone without access gets 404, not a follow.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await register(otherPage, "Stranger", `stranger-${stamp}@example.com`);
  const denied = await otherPage.request.post(`/api/tasks/${taskId}/followers`);
  expect(denied.status()).toBe(404);
  await other.close();
});
