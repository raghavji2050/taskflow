import { test, expect, type Page } from "@playwright/test";

// Project views (Overview/List/Board/Calendar/Timeline) and the task side panel. Throwaway CI/local MySQL only.
test.use({ extraHTTPHeaders: { "x-test-client-ip": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
test.describe.configure({ mode: "serial", timeout: 120_000 });

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const user = { name: "Sections E2E", email: `pview-${stamp}@example.com`, password: "e2e-password-123" };
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

test("views: List, Board, Calendar, Timeline, Overview — each renders and remembers choice", async ({ page }) => {
  await openProject(page);
  const ids = await sectionIds(page);
  const today = new Date();
  const due = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  await addTaskApi(page, `Dated ${stamp}`, ids[0]!.id, { dueDate: due });
  await page.reload();
  const tabs = page.getByRole("tablist", { name: "Project views" });
  await expect(tabs).toBeVisible({ timeout: 20_000 });

  await tabs.getByRole("tab", { name: "List" }).click();
  await expect(tabs.getByRole("tab", { name: "List" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("project-task-card").filter({ hasText: `Dated ${stamp}` })).toBeVisible();
  if (proof) await page.screenshot({ path: `${proof}/qa-view-list.png`, fullPage: true });
  await page.reload();
  await expect(page.getByRole("tablist", { name: "Project views" }).getByRole("tab", { name: "List" })).toHaveAttribute("aria-selected", "true", { timeout: 20_000 });

  await tabs.getByRole("tab", { name: "Calendar" }).click();
  const cal = page.getByTestId("project-calendar");
  await expect(cal).toBeVisible();
  await cal.getByText(`Dated ${stamp}`).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  if (proof) await page.screenshot({ path: `${proof}/qa-view-calendar.png`, fullPage: true });

  await tabs.getByRole("tab", { name: "Timeline" }).click();
  await expect(page.getByTestId("project-timeline")).toContainText(`Dated ${stamp}`);
  if (proof) await page.screenshot({ path: `${proof}/qa-view-timeline.png`, fullPage: true });

  await tabs.getByRole("tab", { name: "Overview" }).click();
  const overview = page.getByTestId("project-overview");
  await expect(overview).toContainText("Progress");
  await expect(overview.getByTestId("overview-total")).toHaveText(/\d+/);
  if (proof) await page.screenshot({ path: `${proof}/qa-view-overview.png`, fullPage: true });

  await tabs.getByRole("tab", { name: "Board" }).click();
  await expect(page.locator("section[data-section-id]").first()).toBeVisible();
});

test("task side panel: one scroll, autosave, inline subtasks and comments", async ({ page }) => {
  await openProject(page);
  const ids = await sectionIds(page);
  await addTaskApi(page, `Panel ${stamp}`, ids[0]!.id);
  await page.reload();
  await page.getByRole("tab", { name: "Board" }).click();
  const card = page.getByTestId("project-task-card").filter({ hasText: `Panel ${stamp}` });
  await card.getByText("MEDIUM").click();

  const panel = page.getByRole("dialog");
  await expect(panel).toHaveAttribute("data-variant", "panel");
  // No tabs: subtasks, comments, files all inline in one scroll.
  await expect(panel.getByRole("button", { name: "Collaboration" })).toHaveCount(0);
  for (const id of ["work", "comments", "files", "time", "more"]) {
    await expect(panel.getByTestId(`task-panel-${id}`)).toBeAttached();
  }

  // Autosave the title, no submit.
  const saved = page.waitForResponse((r) => /\/api\/tasks\/[^/]+$/.test(r.url()) && r.request().method() === "PUT");
  await panel.getByLabel("Title").fill(`Panel ${stamp} renamed`);
  expect((await saved).ok()).toBeTruthy();
  await expect(panel.getByTestId("autosave-status")).toHaveText("Saved");

  // Inline subtask + comment.
  await panel.getByLabel("Add subtask").fill("Write brief");
  await panel.getByLabel("Add subtask").press("Enter");
  await expect(panel.getByTestId("task-panel-work")).toContainText("Write brief");
  await expect(panel.getByTestId("task-panel-work")).toContainText("Subtasks 0/1");
  await panel.getByTestId("task-panel-work").getByText("Write brief").click();
  await expect(panel.getByTestId("task-panel-work")).toContainText("Subtasks 1/1");
  await panel.getByPlaceholder(/Write a comment/).fill("Looks good");
  await panel.getByRole("button", { name: "Post" }).click();
  await expect(panel.getByTestId("task-panel-comments")).toContainText("Looks good");
  if (proof) await page.screenshot({ path: `${proof}/feat-side-panel-desktop.png` });

  await panel.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Board behind the panel refreshed with the autosaved title.
  await expect(page.getByTestId("project-task-card").filter({ hasText: `Panel ${stamp} renamed` })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("project-task-card").filter({ hasText: `Panel ${stamp} renamed` })).toBeVisible({ timeout: 20_000 });
});

test("section header shows done/total counts", async ({ page }) => {
  await openProject(page);
  await page.getByRole("tab", { name: "Board" }).click();
  const first = page.locator("section[data-section-id]").first();
  await expect(first.getByTestId("section-count")).toHaveText(/^\d+\/\d+$/);
  const ids = await sectionIds(page);
  const id = await addTaskApi(page, `Done one ${stamp}`, ids[0]!.id, { status: "COMPLETED" });
  expect(id).toBeTruthy();
  const before = await first.getByTestId("section-count").innerText();
  await page.reload();
  const [d0, t0] = before.split("/").map(Number);
  await expect(page.locator("section[data-section-id]").first().getByTestId("section-count")).toHaveText(`${d0! + 1}/${t0! + 1}`, { timeout: 20_000 });
});
