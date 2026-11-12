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

test("goals roll up progress from linked projects, tasks and key results", async ({ page, browser }) => {
  await register(page, "Goal Owner", `goals-${stamp}@example.com`);
  const ws = await page.request.post("/api/workspaces", { data: { name: `Goals WS ${stamp}` } });
  expect(ws.status()).toBe(201);
  const workspaceId = (await ws.json()).workspace.id as string;
  const proj = await page.request.post(`/api/workspaces/${workspaceId}/projects`, { data: { name: `Website ${stamp}` } });
  const projectId = (await proj.json()).project.id as string;
  const mk = async (title: string, status: string) => {
    const r = await page.request.post("/api/tasks", { data: { title, priority: "MEDIUM", status, workspaceId, projectId } });
    expect(r.status(), await r.text()).toBe(201);
    return (await r.json()).task.id as string;
  };
  await mk("Design", "COMPLETED");
  await mk("Build", "PENDING");
  const launchId = await mk("Launch", "PENDING");

  // API: create goal, link project -> progress from project tasks.
  const g = await page.request.post("/api/goals", { data: { workspaceId, title: `Launch website ${stamp}`, dueDate: "2099-12-31" } });
  expect(g.status(), await g.text()).toBe(201);
  const goalId = (await g.json()).goal.id as string;
  let goal = (await (await page.request.post(`/api/goals/${goalId}/links`, { data: { projectId } })).json()).goal;
  expect(goal.progress).toBe(33);
  // Key result linked to a single task.
  const kr = await page.request.post("/api/goals", { data: { workspaceId, title: "Ship launch post", parentId: goalId } });
  const krId = (await kr.json()).goal.id as string;
  await page.request.post(`/api/goals/${krId}/links`, { data: { taskId: launchId } });
  goal = (await (await page.request.get(`/api/goals/${goalId}`)).json()).goal;
  expect(goal.progress).toBe(17); // avg(33, 0)
  expect(goal.childIds).toEqual([krId]);
  // Completing the task moves both up automatically.
  expect((await page.request.put(`/api/tasks/${launchId}`, { data: { title: "Launch", priority: "MEDIUM", status: "COMPLETED" } })).ok()).toBeTruthy();
  goal = (await (await page.request.get(`/api/goals/${goalId}`)).json()).goal;
  expect(goal.progress).toBe(83); // avg(67, 100)
  // Loops refused.
  expect((await page.request.patch(`/api/goals/${goalId}`, { data: { parentId: krId } })).status()).toBe(409);

  // Stranger can't see the workspace goals.
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-test-client-ip": ip() } });
  const other = await ctx.newPage();
  await register(other, "Goal Stranger", `goals-other-${stamp}@example.com`);
  expect((await other.request.get(`/api/goals?workspaceId=${workspaceId}`)).status()).toBe(404);
  expect((await other.request.get(`/api/goals/${goalId}`)).status()).toBe(404);
  await ctx.close();

  // UI: create a goal from the page.
  await page.evaluate((id) => localStorage.setItem("taskflow-workspace", id), workspaceId);
  await page.goto("/dashboard/goals");
  await expect(page.getByRole("heading", { name: `Launch website ${stamp}` })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("goal-progress").first()).toHaveText("83%");
  await page.getByRole("button", { name: "New goal" }).click();
  await page.getByLabel("Title").fill(`Hire 2 devs ${stamp}`);
  await page.getByRole("button", { name: "Create goal" }).click();
  await expect(page.getByRole("heading", { name: `Hire 2 devs ${stamp}` })).toBeVisible();
  await page.getByRole("button", { name: `Expand Launch website ${stamp}` }).click();
  const linked = page.getByRole("list", { name: `Linked to Launch website ${stamp}` });
  await expect(linked.getByRole("link", { name: `Website ${stamp}` })).toBeVisible();
  await expect(linked.getByText("2/3 done")).toBeVisible();
});
