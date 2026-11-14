import { expect, type Page } from "@playwright/test";

// Runs against a throwaway MySQL database (CI service container). Never prod.
export const randomIp = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

export const XSS_PAYLOAD = `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script><a href="javascript:window.__xss=3">x</a> @Sec Owner`;

/** Collects CSP violations reported to the browser console. */
export function watchCsp(page: Page) {
  const violations: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (/Content Security Policy/i.test(text)) {
      violations.push(text);
    }
  });
  return violations;
}

export async function register(page: Page, name: string, email: string) {
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("e2e-password-123");
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

/** Posts an XSS comment via the API, opens the task, and checks it renders as plain text. */
export async function expectCommentXssEscaped(page: Page, stamp: string) {
  const created = await page.request.post("/api/tasks", {
    data: { title: `XSS check ${stamp}`, priority: "MEDIUM", status: "PENDING" },
  });
  expect(created.status()).toBe(201);
  const taskId = (await created.json()).task.id as string;
  const posted = await page.request.post(`/api/tasks/${taskId}/comments`, {
    data: { body: XSS_PAYLOAD },
  });
  expect(posted.ok()).toBeTruthy();

  let dialogs = 0;
  page.on("dialog", (d) => {
    dialogs += 1;
    void d.dismiss();
  });

  await page.goto("/dashboard");
  const row = page.locator(".task-row", { hasText: `XSS check ${stamp}` }).first();
  await row.getByRole("button", { name: "Edit task" }).click();
  const comment = page.locator("p", { hasText: "<img src=x onerror=" }).first();
  await expect(comment).toBeVisible();
  await expect(comment).toContainText("<script>window.__xss=2</script>");
  await expect(comment.locator("img, script, a")).toHaveCount(0);
  await expect(comment.locator("span.font-semibold")).toContainText("@Sec Owner");
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  expect(dialogs).toBe(0);
  return taskId;
}
