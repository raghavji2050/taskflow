import { test, expect, type Page } from "@playwright/test";

// Own client IP per spec/context so the sign-up rate limit doesn't trip in CI.
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

async function createTask(page: Page, title: string) {
  const res = await page.request.post("/api/tasks", {
    data: { title, priority: "MEDIUM", status: "PENDING" },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).task as { id: string; title: string };
}

test("blocked-by links: add, refuse loops, warn on early completion, strangers denied", async ({ page, browser }) => {
  await register(page, "Deps Owner", `deps-${stamp}@example.com`);
  const design = await createTask(page, `Design ${stamp}`);
  const build = await createTask(page, `Build ${stamp}`);

  // API: Build is blocked by Design.
  const added = await page.request.post(`/api/tasks/${build.id}/dependencies`, {
    data: { dependsOnId: design.id },
  });
  expect(added.status()).toBe(201);
  const deps = await added.json();
  expect(deps.blockedBy.map((t: { id: string }) => t.id)).toEqual([design.id]);
  expect(deps.openBlockerCount).toBe(1);

  // Loop refused, self refused.
  const loop = await page.request.post(`/api/tasks/${design.id}/dependencies`, {
    data: { dependsOnId: build.id },
  });
  expect(loop.status()).toBe(409);
  const self = await page.request.post(`/api/tasks/${build.id}/dependencies`, {
    data: { dependsOnId: build.id },
  });
  expect(self.status()).toBe(400);

  // Design shows Build under "blocking".
  const designDeps = await (await page.request.get(`/api/tasks/${design.id}/dependencies`)).json();
  expect(designDeps.blocking.map((t: { id: string }) => t.id)).toEqual([build.id]);

  // Completing Build early still works but returns a warning.
  const early = await page.request.put(`/api/tasks/${build.id}`, {
    data: { title: build.title, priority: "MEDIUM", status: "COMPLETED" },
  });
  expect(early.ok()).toBe(true);
  expect((await early.json()).warning?.openBlockers?.[0]?.id).toBe(design.id);
  await page.request.put(`/api/tasks/${build.id}`, {
    data: { title: build.title, priority: "MEDIUM", status: "PENDING" },
  });

  // UI: the task panel shows the blocked banner and the blocker.
  await page.goto("/dashboard");
  const row = page.locator(".task-row", { hasText: `Build ${stamp}` }).first();
  await row.getByRole("button", { name: "Edit task" }).click();
  const box = page.getByTestId("task-dependencies");
  await expect(box).toContainText("Blocked: waiting on 1 open task");
  await expect(box).toContainText(`Design ${stamp}`);

  // UI: remove the blocker.
  await box.getByRole("button", { name: `Remove blocker Design ${stamp}` }).click();
  await expect(box).toContainText("Nothing is blocking this task");

  // UI: add it back through the search box.
  await box.getByLabel("Add a blocking task").fill(`Design ${stamp}`);
  await box.getByRole("option", { name: `Design ${stamp}` }).click();
  await expect(box).toContainText("Blocked: waiting on 1 open task");

  // Someone without access can't read or add links.
  const other = await browser.newContext({ extraHTTPHeaders: { "x-test-client-ip": ip() } });
  const otherPage = await other.newPage();
  await register(otherPage, "Deps Stranger", `deps-stranger-${stamp}@example.com`);
  expect((await otherPage.request.get(`/api/tasks/${build.id}/dependencies`)).status()).toBe(404);
  const mine = await createTask(otherPage, `Mine ${stamp}`);
  const cross = await otherPage.request.post(`/api/tasks/${mine.id}/dependencies`, {
    data: { dependsOnId: design.id },
  });
  expect(cross.status()).toBe(404);
  await other.close();
});
