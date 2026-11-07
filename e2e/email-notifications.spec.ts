import { test, expect, type Page } from "@playwright/test";

// Own client IP per spec/context so the sign-up rate limit doesn't trip in CI.
const ip = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
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

async function saveEmailPrefs(page: Page) {
  const section = page.getByTestId("email-notifications-settings");
  const [res] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/user/email-prefs") && r.request().method() === "PATCH"
    ),
    section.getByTestId("email-prefs-save").click(),
  ]);
  expect(res.ok()).toBe(true);
  return res.json();
}

test("email notification prefs default on and persist from Settings", async ({ page }) => {
  await register(page, "Email Prefs", `email-prefs-${stamp}@example.com`);

  await page.goto("/settings");
  const section = page.getByTestId("email-notifications-settings");
  await expect(section).toBeVisible({ timeout: 15_000 });

  const digest = section.getByTestId("email-digest-toggle");
  const mention = section.getByTestId("email-mention-toggle");
  await expect(digest).toBeChecked();
  await expect(mention).toBeChecked();

  const initial = await (await page.request.get("/api/user/email-prefs")).json();
  expect(initial.prefs).toEqual({ emailDigestEnabled: true, emailMentionEnabled: true });

  await digest.uncheck();
  const afterDigestSave = await saveEmailPrefs(page);
  expect(afterDigestSave.prefs).toEqual({
    emailDigestEnabled: false,
    emailMentionEnabled: true,
  });

  const afterDigest = await (await page.request.get("/api/user/email-prefs")).json();
  expect(afterDigest.prefs).toEqual({
    emailDigestEnabled: false,
    emailMentionEnabled: true,
  });

  await mention.uncheck();
  const afterMentionSave = await saveEmailPrefs(page);
  expect(afterMentionSave.prefs).toEqual({
    emailDigestEnabled: false,
    emailMentionEnabled: false,
  });

  const afterMention = await (await page.request.get("/api/user/email-prefs")).json();
  expect(afterMention.prefs).toEqual({
    emailDigestEnabled: false,
    emailMentionEnabled: false,
  });

  await page.reload();
  await expect(page.getByTestId("email-digest-toggle")).not.toBeChecked();
  await expect(page.getByTestId("email-mention-toggle")).not.toBeChecked();
});
