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

test("Insights dashboard shows workspace and project charts", async ({ page }) => {
  await register(page, "Insights Owner", `insights-${stamp}@example.com`);
  const session = await (await page.request.get("/api/auth/session")).json();
  const userId = session.user.id as string;

  const ws = await page.request.post("/api/workspaces", { data: { name: `Insights WS ${stamp}` } });
  expect(ws.status()).toBe(201);
  const workspaceId = (await ws.json()).workspace.id as string;
  const mkProject = async (name: string) => {
    const res = await page.request.post(`/api/workspaces/${workspaceId}/projects`, { data: { name } });
    expect(res.ok(), await res.text()).toBeTruthy();
    return (await res.json()).project.id as string;
  };
  const launch = await mkProject(`Launch ${stamp}`);
  const ops = await mkProject(`Ops ${stamp}`);

  const mk = async (data: Record<string, unknown>) => {
    const res = await page.request.post("/api/tasks", {
      data: { priority: "MEDIUM", status: "PENDING", workspaceId, ...data },
    });
    expect(res.status(), await res.text()).toBe(201);
  };
  await mk({ title: `Overdue ${stamp}`, projectId: launch, dueDate: "2020-01-15", assigneeIds: [userId] });
  await mk({ title: `Doing ${stamp}`, projectId: launch, status: "IN_PROGRESS", assigneeIds: [userId] });
  await mk({ title: `Done ${stamp}`, projectId: launch, status: "COMPLETED", assigneeIds: [userId] });
  await mk({ title: `Ops open ${stamp}`, projectId: ops, assigneeIds: [] });

  // API: workspace scope.
  const api = await page.request.get(`/api/insights?workspaceId=${workspaceId}&tzOffset=-330`);
  expect(api.status()).toBe(200);
  const body = await api.json();
  expect(body.totals).toMatchObject({ open: 3, inProgress: 1, completed: 1, overdue: 1, unassignedOpen: 1, completionRate: 25, completedThisWeek: 1 });
  expect(body.byAssignee[0]).toMatchObject({ userId, open: 2, overdue: 1, completed: 1 });
  expect(body.byProject.map((p: { name: string }) => p.name)).toEqual([`Launch ${stamp}`, `Ops ${stamp}`]);
  expect(body.completedPerWeek).toHaveLength(8);

  // Not a member: forbidden.
  const other = await page.request.get(`/api/insights?workspaceId=not-a-real-workspace`);
  expect(other.status()).toBe(403);

  // UI: select the workspace, open Insights from the sidebar.
  await page.evaluate((id) => localStorage.setItem("taskflow-workspace", id), workspaceId);
  await page.goto("/dashboard/reports/insights");
  await expect(page.getByRole("heading", { name: "Insights" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("insights-open")).toHaveText("3", { timeout: 15_000 });
  await expect(page.getByTestId("insights-overdue")).toHaveText("1");
  await expect(page.getByTestId("insights-completion")).toHaveText("25%");
  await expect(page.getByTestId("insights-status-chart")).toBeVisible();
  await expect(page.getByTestId("insights-weekly-chart")).toBeVisible();
  await expect(page.getByTestId("insights-assignee-chart")).toBeVisible();
  await expect(page.getByTestId("insights-project-chart")).toBeVisible();
  await expect(page.getByTestId("insights-unassigned")).toContainText("1 open task has no assignee");

  // Project filter narrows the numbers.
  const narrowed = page.waitForResponse((r) => r.url().includes("/api/insights") && r.url().includes(`projectId=${ops}`));
  await page.getByTestId("insights-project-filter").selectOption(ops);
  expect((await narrowed).status()).toBe(200);
  await expect(page.getByTestId("insights-open")).toHaveText("1");
  await expect(page.getByTestId("insights-overdue")).toHaveText("0");
  await expect(page.getByTestId("insights-project-chart")).toHaveCount(0);
});
