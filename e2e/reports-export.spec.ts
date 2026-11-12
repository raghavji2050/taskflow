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

test("export tasks as CSV/PDF from Insights; scope and access are enforced", async ({ page, browser }) => {
  await register(page, "Export Owner", `exp-${stamp}@example.com`);
  const ws = (await (await page.request.post("/api/workspaces", { data: { name: `Export WS ${stamp}` } })).json()).workspace.id as string;
  for (const [title, status] of [[`=SUM(A1) ${stamp}`, "PENDING"], [`Ship, "v2" ${stamp}`, "COMPLETED"]]) {
    expect((await page.request.post("/api/tasks", { data: { title, priority: "HIGH", status, workspaceId: ws } })).status()).toBe(201);
  }
  const csv = await page.request.get(`/api/reports/export?type=tasks&format=csv&workspaceId=${ws}`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(csv.headers()["content-disposition"]).toMatch(/attachment; filename="taskflow-tasks-export-ws-/);
  const text = await csv.text();
  expect(text).toContain("Title,Status,Priority");
  expect(text).toContain(`'=SUM(A1) ${stamp}`);
  expect(text).toContain(`"Ship, ""v2"" ${stamp}"`);

  const pdf = await page.request.get(`/api/reports/export?type=tasks&format=pdf&workspaceId=${ws}`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const time = await page.request.get(`/api/reports/export?type=time&format=csv&workspaceId=${ws}&range=month`);
  expect((await time.text())).toContain("Date,Person,Task,Project,Hours,Note");

  // UI: Insights has CSV/PDF buttons; the CSV one downloads a file.
  await page.evaluate((w) => localStorage.setItem("taskflow-workspace", w), ws);
  await page.goto("/dashboard/reports/insights");
  const dl = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export tasks as CSV" }).click();
  expect((await dl).suggestedFilename()).toMatch(/^taskflow-tasks-.*\.csv$/);
  await expect(page.getByRole("link", { name: "Export tasks as PDF" })).toBeVisible();

  // Someone outside the workspace cannot export it.
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-test-client-ip": ip() } });
  const other = await ctx.newPage();
  await register(other, "Outsider", `exp-out-${stamp}@example.com`);
  expect((await other.request.get(`/api/reports/export?type=tasks&format=csv&workspaceId=${ws}`)).status()).toBe(403);
  await ctx.close();
});

test("project templates: built-in, save as template, create from saved", async ({ page }) => {
  await register(page, "Template Owner", `tpl-${stamp}@example.com`);
  const ws = (await (await page.request.post("/api/workspaces", { data: { name: `Template WS ${stamp}` } })).json()).workspace.id as string;
  const list = (await (await page.request.get(`/api/workspaces/${ws}/project-templates`)).json()).templates as Array<{ id: string; builtIn: boolean; name: string }>;
  expect(list.filter((t) => t.builtIn).map((t) => t.name)).toEqual(expect.arrayContaining(["Software sprint", "Marketing campaign"]));

  // UI: New project -> Start from "Software sprint".
  await page.evaluate((w) => localStorage.setItem("taskflow-workspace", w), ws);
  await page.goto("/dashboard/projects");
  await page.getByRole("button", { name: /New project/ }).first().click();
  await page.getByLabel("Start from").selectOption("builtin:sprint");
  await page.getByLabel("Name", { exact: true }).fill(`Sprint ${stamp}`);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/projects\/[a-z0-9]+/, { timeout: 20_000 });
  const projectId = page.url().split("/").pop()!.split("?")[0];
  await expect(page.getByText("Define sprint goal").first()).toBeVisible({ timeout: 20_000 });
  const detail = await (await page.request.get(`/api/projects/${projectId}`)).json();
  const sectionNames = (detail.sections ?? detail.project?.sections ?? []).map((s: { name: string }) => s.name);
  expect(sectionNames).toEqual(["Backlog", "In progress", "Review / QA", "Done"]);

  // Save it as a team template and create a second project from it.
  const saved = await page.request.post(`/api/projects/${projectId}/save-as-template`, { data: { name: `Our sprint ${stamp}` } });
  expect(saved.status(), await saved.text()).toBe(201);
  const tpl = (await saved.json()).template;
  expect(tpl.taskCount).toBe(5);
  const made = await page.request.post(`/api/workspaces/${ws}/projects/from-template`, { data: { templateId: tpl.id, name: `Sprint 2 ${stamp}` } });
  expect(made.status()).toBe(201);
  expect((await made.json()).tasksCreated).toBe(5);
  expect((await page.request.delete(`/api/workspaces/${ws}/project-templates/${tpl.id}`)).ok()).toBeTruthy();
  expect((await page.request.delete(`/api/workspaces/${ws}/project-templates/builtin:sprint`)).status()).toBe(400);
});
