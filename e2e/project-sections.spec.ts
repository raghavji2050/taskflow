import { test, expect, type Page } from "@playwright/test";

// Project page QA: every view + every section action. Throwaway CI/local MySQL only.
test.use({ extraHTTPHeaders: { "x-test-client-ip": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
test.describe.configure({ mode: "serial", timeout: 120_000 });

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const user = { name: "Sections E2E", email: `psec-${stamp}@example.com`, password: "e2e-password-123" };
let projectId = "";
let workspaceId = "";
const proof = process.env.E2E_PROOF_DIR;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

async function openProject(page: Page) {
  await login(page);
  await page.goto(`/dashboard/projects/${projectId}`);
  await expect(page.getByRole("heading", { name: `QA ${stamp}`, level: 1 })).toBeVisible({ timeout: 20_000 });
}

const section = (page: Page, name: string) =>
  page.locator("section[data-section-id]").filter({ has: page.getByRole("heading", { name, exact: true }) });
const sectionNames = (page: Page) => page.locator("section[data-section-id] h3").allInnerTexts();

async function addTaskApi(page: Page, title: string, sectionId: string, extra: Record<string, unknown> = {}) {
  const res = await page.request.post("/api/tasks", {
    data: { title, status: "PENDING", priority: "MEDIUM", workspaceId, projectId, sectionId, assigneeIds: [], ...extra },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()).task.id as string;
}

async function sectionIds(page: Page) {
  const res = await page.request.get(`/api/projects/${projectId}`);
  const data = await res.json();
  return (data.project.sections as { id: string; name: string; position: number }[]).sort((a, b) => a.position - b.position);
}

test("setup: account, workspace, project", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  const ws = await page.request.post("/api/workspaces", { data: { name: `Sections WS ${stamp}` } });
  expect(ws.ok(), await ws.text()).toBeTruthy();
  workspaceId = (await ws.json()).workspace.id;
  const res = await page.request.post(`/api/workspaces/${workspaceId}/projects`, { data: { name: `QA ${stamp}` } });
  expect(res.ok()).toBeTruthy();
  projectId = (await res.json()).project.id;
});

test("sections: add, rename, reorder, collapse, delete (tasks move, last one protected)", async ({ page }) => {
  await openProject(page);
  for (const name of ["Doing", "Done"]) {
    await page.getByPlaceholder("New section").fill(name);
    await page.getByRole("button", { name: "Add section" }).click();
    await expect(section(page, name)).toBeVisible();
  }
  expect(await sectionNames(page)).toEqual(["To do", "Doing", "Done"]);

  // Rename via pencil + Enter, persists after reload.
  await section(page, "Doing").getByRole("button", { name: "Rename section" }).click();
  await page.getByLabel("Section name").fill("In progress");
  await page.getByLabel("Section name").press("Enter");
  await expect(section(page, "In progress")).toBeVisible();
  await page.reload();
  await expect(section(page, "In progress")).toBeVisible({ timeout: 20_000 });

  // Reorder.
  await section(page, "Done").getByRole("button", { name: "Move section up" }).click();
  await expect.poll(() => sectionNames(page)).toEqual(["To do", "Done", "In progress"]);
  await section(page, "Done").getByRole("button", { name: "Move section down" }).click();
  await expect.poll(() => sectionNames(page)).toEqual(["To do", "In progress", "Done"]);
  await expect(section(page, "To do").getByRole("button", { name: "Move section up" })).toBeDisabled();
  await expect(section(page, "Done").getByRole("button", { name: "Move section down" })).toBeDisabled();

  // Collapse hides tasks, survives reload.
  const ids = await sectionIds(page);
  const todo = ids.find((s) => s.name === "To do")!;
  await addTaskApi(page, `Collapse me ${stamp}`, todo.id);
  await page.reload();
  const card = page.getByTestId("project-task-card").filter({ hasText: `Collapse me ${stamp}` });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await section(page, "To do").getByRole("button", { name: "Collapse section" }).click();
  await expect(card).toBeHidden();
  await page.reload();
  await expect(section(page, "To do")).toBeVisible({ timeout: 20_000 });
  await expect(card).toBeHidden();
  await section(page, "To do").getByRole("button", { name: "Expand section" }).click();
  await expect(card).toBeVisible();

  // Delete a section with a task: task moves, not lost.
  const doneId = ids.find((s) => s.name === "Done")!.id;
  await addTaskApi(page, `Survivor ${stamp}`, doneId);
  await page.reload();
  page.once("dialog", (d) => { expect(d.message()).toContain("To do"); void d.accept(); });
  await section(page, "Done").getByRole("button", { name: "Delete section" }).click();
  await expect(section(page, "Done")).toHaveCount(0);
  await expect(section(page, "To do").getByTestId("project-task-card").filter({ hasText: `Survivor ${stamp}` })).toBeVisible();

  // Remove "In progress" too; the last section can't be deleted.
  page.once("dialog", (d) => void d.accept());
  await section(page, "In progress").getByRole("button", { name: "Delete section" }).click();
  await expect(section(page, "In progress")).toHaveCount(0);
  await expect(section(page, "To do").getByRole("button", { name: "Delete section" })).toBeDisabled();
});

test("move tasks between sections: Move-to menu and drag & drop, persisted", async ({ page }) => {
  await openProject(page);
  await page.getByPlaceholder("New section").fill("Later");
  await page.getByRole("button", { name: "Add section" }).click();
  await expect(section(page, "Later")).toBeVisible();
  const ids = await sectionIds(page);
  const todo = ids.find((s) => s.name === "To do")!;
  await addTaskApi(page, `Mover ${stamp}`, todo.id);
  await addTaskApi(page, `Dragger ${stamp}`, todo.id);
  await page.reload();

  // Move-to (works on touch + keyboard too).
  const mover = page.getByTestId("project-task-card").filter({ hasText: `Mover ${stamp}` });
  await expect(mover).toBeVisible({ timeout: 20_000 });
  const moved = page.waitForResponse((r) => r.url().includes("/tasks/move") && r.request().method() === "POST");
  await mover.getByLabel(`Move Mover ${stamp} to section`).selectOption({ label: "Later" });
  expect((await moved).ok()).toBeTruthy();
  await expect(section(page, "Later").getByTestId("project-task-card").filter({ hasText: `Mover ${stamp}` })).toBeVisible();

  // Drag & drop on the board.
  const dragger = section(page, "To do").getByTestId("project-task-card").filter({ hasText: `Dragger ${stamp}` });
  const handle = dragger.getByRole("button", { name: `Drag Dragger ${stamp}` });
  const target = section(page, "Later").locator("[data-section-drop]");
  const hb = (await handle.boundingBox())!;
  const tb = (await target.boundingBox())!;
  const dragged = page.waitForResponse((r) => r.url().includes("/tasks/move") && r.request().method() === "POST");
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + 20, hb.y + 20, { steps: 5 });
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height - 10, { steps: 15 });
  await page.mouse.up();
  await expect(section(page, "Later").getByTestId("project-task-card").filter({ hasText: `Dragger ${stamp}` })).toBeVisible();

  expect((await dragged).ok()).toBeTruthy();
  await page.reload();
  const later = section(page, "Later");
  await expect(later.getByTestId("project-task-card").filter({ hasText: `Mover ${stamp}` })).toBeVisible({ timeout: 20_000 });
  await expect(later.getByTestId("project-task-card").filter({ hasText: `Dragger ${stamp}` })).toBeVisible();
  if (proof) await page.screenshot({ path: `${proof}/qa-board-after-move.png`, fullPage: true });
});

test("List/Board toggle renders the same sections and remembers the choice", async ({ page }) => {
  await openProject(page);
  await page.getByRole("tab", { name: "List" }).click();
  await expect(page.getByRole("tab", { name: "List" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("section[data-section-id]").first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("tab", { name: "List" })).toHaveAttribute("aria-selected", "true", { timeout: 20_000 });
  if (proof) await page.screenshot({ path: `${proof}/qa-view-list.png`, fullPage: true });
  await page.getByRole("tab", { name: "Board" }).click();
  await expect(page.getByRole("tab", { name: "Board" })).toHaveAttribute("aria-selected", "true");
});

test("members dialog and settings: rename, color, archive, restore", async ({ page }) => {
  await openProject(page);
  await page.getByRole("button", { name: "Members" }).click();
  await expect(page.getByRole("dialog")).toContainText(user.name);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Settings" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Description").fill("QA description");
  await dlg.getByRole("button", { name: /Use color/ }).nth(2).click();
  await dlg.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("QA description")).toBeVisible();

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("This project is archived")).toBeVisible();
  await expect(page.getByPlaceholder("New section")).toHaveCount(0);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("This project is archived")).toHaveCount(0);
  await expect(page.getByPlaceholder("New section")).toBeVisible();
});
