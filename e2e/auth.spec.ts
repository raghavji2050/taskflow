import { test, expect } from "@playwright/test";

test("login page loads", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("register page loads", async ({ page }) => {
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
});

test("forgot password page loads", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: "Forgot Password" })).toBeVisible();
});

test("home page redirects unauthenticated users to login from dashboard", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/login/);
});
