import { test, expect } from "@playwright/test";

test.describe("Time tracking", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("demo@todo.app");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/dashboard/);
  });

  test("loads time reports page", async ({ page }) => {
    await page.goto("/dashboard/reports/time");
    await expect(page.getByRole("heading", { name: "Time Reports" })).toBeVisible();
    await expect(page.getByText("team workspaces")).not.toBeVisible();
    await expect(page.getByText("Total tracked")).toBeVisible();
    await expect(page.getByText("Hours by task")).toBeVisible();
    await expect(page.getByLabel("Filter by task")).toBeVisible();
  });

  test("task detail history has filter controls", async ({ page }) => {
    await page.goto("/dashboard");
    const editBtn = page.getByRole("button", { name: /Edit task|View task/ }).first();
    if ((await editBtn.count()) === 0) return;
    await editBtn.click();
    await expect(page.getByText("Time tracking")).toBeVisible();
    await expect(page.getByLabel("Page size")).toBeVisible();
  });

  test("starting timer promotes task to in progress", async ({ page }) => {
    await page.goto("/dashboard");
    const editBtn = page.getByRole("button", { name: /Edit task|View task/ }).first();
    if ((await editBtn.count()) === 0) return;
    await editBtn.click();
    const startBtn = page.getByRole("button", { name: "Start" });
    if ((await startBtn.count()) === 0) return;
    await startBtn.click();
    const modalStartBtn = page.getByRole("button", { name: "Start", exact: true });
    if ((await modalStartBtn.count()) > 0) await modalStartBtn.click();
    await expect(page.getByText(/IN_PROGRESS|In Progress/i)).toBeVisible({ timeout: 10000 });
  });

  test("dashboard shows time widgets", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("My time today")).toBeVisible();
    await expect(page.getByText("This week")).toBeVisible();
  });
});
