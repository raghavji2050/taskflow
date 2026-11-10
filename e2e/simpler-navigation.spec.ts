import { test, expect, type Page } from "@playwright/test";

// Simpler navigation: slim sidebar + projects in sidebar, click-to-open tasks,
// no Personal-mode dead ends, remembered workspace, inline quick-add, duplicate-section warning.
// Runs against the throwaway CI MySQL only.
test.use({ extraHTTPHeaders: { "x-test-client-ip": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
test.describe.configure({ mode: "serial", timeout: 120_000 });

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const user = { name: "Nav E2E", email: `nav-${stamp}@example.com`, password: "e2e-password-123" };
const wsName = `Nav WS ${stamp}`;
let workspaceId = "";
let projectId = "";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

const sidebar = (page: Page) => page.getByRole("navigation", { name: "Main" });

test("signup lands in a slim sidebar with task views as tabs", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  const nav = sidebar(page);
  await expect(nav.getByRole("link", { name: "My Tasks" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Messages" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Docs" })).toBeVisible();
  // Views moved out of the sidebar into tabs.
  await expect(nav.getByRole("link", { name: "Board" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Calendar" })).toHaveCount(0);
  // Less-used pages live under More but stay reachable.
  await nav.getByRole("button", { name: "More" }).click();
  await expect(nav.getByRole("link", { name: "Time Reports" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Trash" })).toBeVisible();

  const tabs = page.getByTestId("task-view-tabs");
  for (const label of ["List", "Board", "Calendar", "Timeline", "My Work"]) {
    await expect(tabs.getByRole("link", { name: label })).toBeVisible();
  }
  await tabs.getByRole("link", { name: "Board" }).click();
  await expect(page).toHaveURL(/\/dashboard\/board/);
  await expect(nav.getByRole("link", { name: "My Tasks" })).toHaveAttribute("aria-current", "page");
});

test("Personal mode: Projects is not a dead end — create a workspace in place", async ({ page }) => {
  await login(page);
  await sidebar(page).getByTestId("sidebar-projects").getByRole("link", { name: /Set one up/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/projects$/);
  const setup = page.getByTestId("workspace-setup");
  await expect(setup).toBeVisible();
  await setup.getByLabel("Workspace name").fill(wsName);
  await setup.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByRole("button", { name: "New project" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("workspace-setup")).toHaveCount(0);

  const list = await page.request.get("/api/workspaces");
  workspaceId = ((await list.json()).workspaces as { id: string; name: string }[]).find((w) => w.name === wsName)!.id;
  const res = await page.request.post(`/api/workspaces/${workspaceId}/projects`, { data: { name: `Launch ${stamp}` } });
  expect(res.ok()).toBeTruthy();
  projectId = (await res.json()).project.id;

  // Team page in a workspace works; it also no longer bounces from Personal (covered by setup card).
  await page.goto("/dashboard/projects");
  const projectLink = sidebar(page).getByRole("link", { name: `Launch ${stamp}` });
  await expect(projectLink).toBeVisible({ timeout: 20_000 });
  await projectLink.click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/projects/${projectId}`));
  await expect(projectLink).toHaveAttribute("aria-current", "page");
});

test("section quick-add parses Hinglish, and clicking the card opens the task", async ({ page }) => {
  await login(page);
  await page.goto(`/dashboard/projects/${projectId}`);
  const quick = page.locator('[data-testid^="section-quick-add-"]').first();
  await expect(quick).toBeVisible({ timeout: 20_000 });
  await quick.getByLabel("Add task").fill(`kal 5 baje client call ${stamp} !high`);
  await expect(page.locator('[data-testid$="-preview"]').first()).toContainText("Kal");
  await quick.getByLabel("Add task").press("Enter");

  const card = page.getByTestId("project-task-card").filter({ hasText: `client call ${stamp}` });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("HIGH");
  await expect(card).not.toContainText("kal 5 baje");
  // Click the card body (badge area), not the title button.
  await card.getByText("HIGH").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByLabel("Title")).toHaveValue(`client call ${stamp}`);
});

test("adding a duplicate section name warns first", async ({ page }) => {
  await login(page);
  await page.goto(`/dashboard/projects/${projectId}`);
  const headings = page.locator("section h3");
  await expect(headings.first()).toBeVisible({ timeout: 20_000 });
  const existing = (await headings.first().innerText()).trim();
  const before = await headings.count();

  let message = "";
  page.once("dialog", (d) => { message = d.message(); void d.dismiss(); });
  await page.getByPlaceholder("New section").fill(existing.toUpperCase());
  await page.getByRole("button", { name: "Add section" }).click();
  await expect.poll(() => message).toContain("already exists");
  await page.waitForTimeout(800);
  await expect(headings).toHaveCount(before);
});

test("list quick-add + click anywhere on the row opens it", async ({ page }) => {
  await login(page);
  await page.goto("/dashboard");
  const quick = page.getByTestId("quick-add-task");
  await quick.getByLabel("Add task").fill(`List quick ${stamp} !low`);
  await quick.getByLabel("Add task").press("Enter");
  const row = page.locator(".task-row", { hasText: `List quick ${stamp}` });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row).toContainText("LOW");
  await row.getByRole("heading", { name: `List quick ${stamp}` }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Nested controls still do their own thing (status toggle doesn't open the dialog).
  await row.getByRole("button", { name: "Cycle status" }).click();
  await page.waitForTimeout(400);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the last workspace is remembered after sign out and back in", async ({ page, context }) => {
  await login(page);
  // Fresh browser context: pick the workspace once, then it should stick across sign-out/in.
  await page.getByRole("button", { name: /Personal/ }).first().click();
  await page.getByRole("button", { name: new RegExp(wsName) }).or(page.getByRole("menuitem", { name: new RegExp(wsName) })).first().click();
  await expect(page.getByRole("button", { name: new RegExp(wsName) }).first()).toBeVisible({ timeout: 20_000 });
  await page.locator(".sidebar-user-trigger:visible").click();
  const before = (await context.cookies()).find((c) => /session-token/.test(c.name));
  expect(before).toBeTruthy();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
  // A request that was still in flight can re-set the old session cookie after sign-out
  // (Auth.js re-signs it on every read). Simulate that: it must not sign us back in.
  await context.addCookies([before!]);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  await expect(page.getByLabel("Email")).toBeVisible();
  expect((await context.cookies()).some((c) => /session-token/.test(c.name))).toBe(false);
  await login(page);
  await expect(page.getByText(wsName).first()).toBeVisible({ timeout: 20_000 });
  await expect(sidebar(page).getByRole("link", { name: `Launch ${stamp}` })).toBeVisible();
});
