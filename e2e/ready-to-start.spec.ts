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

test("blocked badge on cards + Ready to start filter in My Work", async ({ page }) => {
  await register(page, "Ready Owner", `ready-${stamp}@example.com`);

  const session = await (await page.request.get("/api/auth/session")).json();
  const userId = session.user.id as string;

  const wsRes = await page.request.post("/api/workspaces", {
    data: { name: `Ready WS ${stamp}` },
  });
  expect(wsRes.status()).toBe(201);
  const workspaceId = (await wsRes.json()).workspace.id as string;

  async function createAssigned(title: string) {
    const res = await page.request.post("/api/tasks", {
      data: {
        title,
        priority: "MEDIUM",
        status: "PENDING",
        workspaceId,
        assigneeIds: [userId],
      },
    });
    expect(res.status()).toBe(201);
    return (await res.json()).task as { id: string; title: string };
  }

  const design = await createAssigned(`Design ${stamp}`);
  const build = await createAssigned(`Build ${stamp}`);

  const linked = await page.request.post(`/api/tasks/${build.id}/dependencies`, {
    data: { dependsOnId: design.id },
  });
  expect(linked.status()).toBe(201);
  expect((await linked.json()).openBlockerCount).toBe(1);

  // My Work: Build shows the blocked badge; Design does not.
  await page.goto("/dashboard/my-work");
  await expect(page.getByTestId("ready-to-start-filter")).toBeVisible({ timeout: 15_000 });

  const buildRow = page.locator('[data-testid="task-row"]', { hasText: `Build ${stamp}` });
  const designRow = page.locator('[data-testid="task-row"]', { hasText: `Design ${stamp}` });
  await expect(buildRow).toBeVisible();
  await expect(designRow).toBeVisible();
  await expect(buildRow.getByTestId("blocked-badge")).toBeVisible();
  await expect(designRow.getByTestId("blocked-badge")).toHaveCount(0);

  // Ready filter: Design stays, Build hides.
  await page.getByTestId("ready-to-start-filter").click();
  await expect(page.getByTestId("ready-to-start-filter")).toHaveAttribute("aria-pressed", "true");
  await expect(designRow).toBeVisible();
  await expect(buildRow).toHaveCount(0);

  // Finish Design → Build becomes ready (badge gone, visible under Ready).
  const done = await page.request.put(`/api/tasks/${design.id}`, {
    data: {
      title: design.title,
      priority: "MEDIUM",
      status: "COMPLETED",
      workspaceId,
      assigneeIds: [userId],
    },
  });
  expect(done.ok()).toBe(true);

  await page.goto("/dashboard/my-work");
  await page.getByTestId("ready-to-start-filter").click();
  await expect(page.getByTestId("ready-to-start-filter")).toHaveAttribute("aria-pressed", "true");

  const buildReady = page.locator('[data-testid="task-row"]', { hasText: `Build ${stamp}` });
  await expect(buildReady).toBeVisible({ timeout: 15_000 });
  await expect(buildReady.getByTestId("blocked-badge")).toHaveCount(0);
  // Design is completed so it should not appear under Ready.
  await expect(page.locator('[data-testid="task-row"]', { hasText: `Design ${stamp}` })).toHaveCount(0);
});
