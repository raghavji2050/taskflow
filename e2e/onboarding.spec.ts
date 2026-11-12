import { test, expect, type Page } from "@playwright/test";

const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
test.use({ extraHTTPHeaders: { "x-test-client-ip": ip() } });

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

test("getting started checklist, sample tasks and dismiss", async ({ page }) => {
  await register(page, "Onboard User", `onb-${stamp}@example.com`);
  const card = page.getByTestId("getting-started");
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("0 of 5 done");
  await expect(page.getByTestId("tasks-empty")).toContainText("No tasks yet");

  await card.getByRole("button", { name: "Add sample tasks" }).click();
  await expect(page.getByText("Plan this week’s priorities").first()).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("2 of 5 done");
  await expect(card.locator('[data-step="first_task"]')).toHaveAttribute("data-done", "true");
  // Idempotent: samples are only added once.
  expect((await (await page.request.post("/api/onboarding/sample-tasks")).json()).created).toBe(0);

  await card.getByRole("button", { name: "Hide getting started" }).click();
  await expect(card).toBeHidden();
  await page.reload();
  await expect(page.getByText("Plan this week’s priorities").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("getting-started")).toHaveCount(0);
  expect((await (await page.request.get("/api/onboarding")).json()).dismissed).toBe(true);
});

test("welcome wizard: team path creates a workspace and invites someone", async ({ page }) => {
  await register(page, "Wizard User", `onb-w-${stamp}@example.com`);
  await page.goto("/dashboard/welcome");
  await expect(page.getByRole("heading", { name: /Welcome to TaskFlow/ })).toBeVisible();
  await page.getByRole("button", { name: /With my team/ }).click();
  await page.getByLabel("Workspace name").fill(`Wizard WS ${stamp}`);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByRole("heading", { name: "Invite a teammate" })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Teammate email").fill(`onb-new-${stamp}@example.com`);
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
  const state = await (await page.request.get("/api/onboarding")).json();
  expect(state.useCase).toBe("team");
  const done = state.steps.filter((s: { done: boolean }) => s.done).map((s: { id: string }) => s.id);
  expect(done).toEqual(expect.arrayContaining(["workspace", "invite"]));
});

test("welcome wizard: personal path adds the first task", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await register(page, "Solo User", `onb-p-${stamp}@example.com`);
  await page.goto("/dashboard/welcome");
  await page.getByRole("button", { name: /Just me/ }).click();
  await page.getByLabel("First task").fill(`Pay bill ${stamp}`);
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
  await expect(page.getByText(`Pay bill ${stamp}`).first()).toBeVisible({ timeout: 20_000 });
  const state = await (await page.request.get("/api/onboarding")).json();
  expect(state.steps.map((s: { id: string }) => s.id)).toEqual(["first_task", "due_date", "complete_task"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});
