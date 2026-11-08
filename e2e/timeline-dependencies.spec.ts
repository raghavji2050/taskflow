import { test, expect, type Page } from "@playwright/test";

// Own client IP per spec/context so the sign-up rate limit doesn't trip in CI.
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
test.use({ extraHTTPHeaders: { "x-test-client-ip": ip() } });

// Runs against a throwaway MySQL database (CI service container). Never prod.
const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const DAY = 86_400_000;
const inDays = (n: number) => {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  return new Date(d.getTime() + n * DAY).toISOString();
};

async function register(page: Page, name: string, email: string) {
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("e2e-password-123");
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

async function createTask(page: Page, title: string, dueDate: string) {
  const res = await page.request.post("/api/tasks", { data: { title, priority: "MEDIUM", status: "PENDING", dueDate } });
  expect(res.status()).toBe(201);
  return (await res.json()).task as { id: string; title: string };
}

async function block(page: Page, taskId: string, dependsOnId: string) {
  const res = await page.request.post(`/api/tasks/${taskId}/dependencies`, { data: { dependsOnId } });
  expect(res.status()).toBe(201);
}

async function dueOf(page: Page, id: string) {
  const res = await page.request.get(`/api/tasks/${id}`);
  return new Date((await res.json()).task.dueDate).getTime();
}

test("timeline draws dependency arrows and moving a blocker later shifts its chain (with undo + opt-out)", async ({ page }) => {
  await register(page, "Timeline Owner", `timeline-${stamp}@example.com`);
  const design = await createTask(page, `Design ${stamp}`, inDays(1));
  const build = await createTask(page, `Build ${stamp}`, inDays(4));
  const ship = await createTask(page, `Ship ${stamp}`, inDays(7));
  await block(page, build.id, design.id);
  await block(page, ship.id, build.id);

  // Timeline: two arrows, Design -> Build -> Ship, no conflicts.
  const listed = page.waitForResponse((r) => r.url().includes("/api/tasks?") && r.request().method() === "GET");
  await page.goto("/dashboard/timeline");
  const list = await (await listed).json();
  const buildRow = list.tasks.find((t: { id: string }) => t.id === build.id);
  expect(buildRow.blockedByIds).toEqual([design.id]);
  const arrows = page.getByTestId("timeline-dependency-arrow");
  await expect(arrows).toHaveCount(2);
  await expect(page.locator(`[data-testid="timeline-dependency-arrow"][data-from="${design.id}"][data-to="${build.id}"]`)).toHaveAttribute("data-conflict", "false");

  // Move Design 2 days later: Build and Ship move 2 days too (gaps kept).
  const buildBefore = await dueOf(page, build.id);
  const shipBefore = await dueOf(page, ship.id);
  const moved = await page.request.put(`/api/tasks/${design.id}`, {
    data: { title: design.title, priority: "MEDIUM", status: "PENDING", dueDate: inDays(3) },
  });
  expect(moved.ok()).toBe(true);
  const body = await moved.json();
  expect(body.shifted.map((s: { id: string }) => s.id).sort()).toEqual([build.id, ship.id].sort());
  expect(await dueOf(page, build.id)).toBe(buildBefore + 2 * DAY);
  expect(await dueOf(page, ship.id)).toBe(shipBefore + 2 * DAY);

  // Undo = due-date-only PATCH, which never cascades.
  for (const s of body.shifted as { id: string; from: string }[]) {
    const undo = await page.request.patch(`/api/tasks/${s.id}`, { data: { dueDate: s.from } });
    expect(undo.ok()).toBe(true);
  }
  expect(await dueOf(page, build.id)).toBe(buildBefore);
  expect(await dueOf(page, ship.id)).toBe(shipBefore);

  // Moving earlier never shifts; opting out never shifts.
  const earlier = await page.request.put(`/api/tasks/${design.id}`, {
    data: { title: design.title, priority: "MEDIUM", status: "PENDING", dueDate: inDays(2) },
  });
  expect((await earlier.json()).shifted).toBeUndefined();
  const optOut = await page.request.put(`/api/tasks/${design.id}`, {
    data: { title: design.title, priority: "MEDIUM", status: "PENDING", dueDate: inDays(6), shiftDependents: false },
  });
  expect((await optOut.json()).shifted).toBeUndefined();
  expect(await dueOf(page, build.id)).toBe(buildBefore);

  // Design (day 6) is now due after Build (day 4): the timeline flags that arrow as a conflict.
  const relisted = page.waitForResponse((r) => r.url().includes("/api/tasks?") && r.request().method() === "GET");
  await page.reload();
  await relisted;
  await expect(page.locator(`[data-testid="timeline-dependency-arrow"][data-from="${design.id}"][data-to="${build.id}"]`)).toHaveAttribute("data-conflict", "true");
});
