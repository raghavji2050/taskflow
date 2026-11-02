import { test, expect, type Page } from "@playwright/test";

// Runs against a throwaway MySQL database (CI service container). Never prod.
test.describe.configure({ mode: "serial" });

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const user = { name: "Session User", email: `sess-${stamp}@example.com`, password: "e2e-password-123" };

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

test("sign out of all devices revokes every session", async ({ browser, page }) => {
  await page.goto("/register");
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  // A second "device" with its own cookies.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await login(otherPage);
  expect((await otherPage.request.get("/api/user/profile")).status()).toBe(200);

  await page.goto("/settings");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Sign out of all devices" }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });

  // The other device's old cookie no longer works.
  expect((await otherPage.request.get("/api/user/profile")).status()).toBe(401);
  // Opening the app with the stale cookie lands on login (no redirect loop).
  await otherPage.goto("/dashboard");
  await expect(otherPage).toHaveURL(/\/login/, { timeout: 30_000 });
  await other.close();

  // Signing in again works and issues a fresh, valid session.
  await login(page);
  expect((await page.request.get("/api/user/profile")).status()).toBe(200);
});
