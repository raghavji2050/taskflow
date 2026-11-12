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

test("attach, list, download and remove task files", async ({ page, browser }) => {
  await register(page, "Files Owner", `files-${stamp}@example.com`);
  const title = `Files task ${stamp}`;
  const created = await page.request.post("/api/tasks", { data: { title, priority: "MEDIUM", status: "PENDING" } });
  expect(created.status()).toBe(201);
  const taskId = (await created.json()).task.id as string;

  // API guards: blocked type, list shape.
  const bad = await page.request.post(`/api/tasks/${taskId}/attachments`, {
    multipart: { file: { name: "setup.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") } },
  });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error).toMatch(/\.exe/);

  // Stranger can't list or delete.
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-test-client-ip": ip() } });
  const other = await ctx.newPage();
  await register(other, "Files Stranger", `files-other-${stamp}@example.com`);
  expect((await other.request.get(`/api/tasks/${taskId}/attachments`)).status()).toBe(404);

  // UI: upload two files through the side panel.
  await page.goto(`/dashboard?openTask=${taskId}`);
  const editor = page.getByRole("dialog", { name: "Edit Task" });
  await expect(editor.getByRole("textbox", { name: "Title" })).toHaveValue(title, { timeout: 15_000 });
  const files = editor.getByTestId("task-attachments").first();
  if (!(await files.isVisible())) await editor.getByRole("button", { name: /^Files/ }).first().click();
  await expect(files).toBeVisible();
  await files.getByLabel("Upload files").setInputFiles([
    { name: "brief.txt", mimeType: "text/plain", buffer: Buffer.from("hello taskflow") },
    { name: "pixel.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") },
  ]);
  await expect(files.getByRole("link", { name: "brief.txt", exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(files.getByRole("link", { name: "pixel.png", exact: true })).toBeVisible();
  await expect(files.getByText("14 B")).toBeVisible();

  const list = await (await page.request.get(`/api/tasks/${taskId}/attachments`)).json();
  expect(list.attachments.map((a: { filename: string }) => a.filename).sort()).toEqual(["brief.txt", "pixel.png"]);
  const brief = list.attachments.find((a: { filename: string }) => a.filename === "brief.txt");
  expect(brief).toMatchObject({ mimeType: "text/plain", size: 14 });
  expect((await other.request.delete(`/api/tasks/${taskId}/attachments/${brief.id}`)).status()).toBe(404);
  await ctx.close();

  // Remove one from the UI.
  page.once("dialog", (d) => d.accept());
  await files.getByRole("button", { name: "Remove brief.txt" }).click();
  await expect(files.getByRole("link", { name: "brief.txt", exact: true })).toHaveCount(0);
  const after = await (await page.request.get(`/api/tasks/${taskId}/attachments`)).json();
  expect(after.attachments).toHaveLength(1);

  const activity = await (await page.request.get(`/api/tasks/${taskId}`)).json();
  const actions = (activity.task.activities ?? []).map((a: { action: string }) => a.action);
  expect(actions).toEqual(expect.arrayContaining(["attachment_added", "attachment_removed"]));
});
