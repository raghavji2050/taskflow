import { test, expect, type Page } from "@playwright/test";

// Project custom fields: define in project, set in side panel, chips + filter in List view. Throwaway CI/local DB only.
test.use({ extraHTTPHeaders: { "x-test-client-ip": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
test.describe.configure({ timeout: 120_000 });

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const proof = process.env.E2E_PROOF_DIR;

async function register(page: Page, name: string, email: string) {
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("e2e-password-123");
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

test("custom fields: define, set in side panel, show as chips and filter the list", async ({ page }) => {
  await register(page, "Fields Owner", `fields-${stamp}@example.com`);
  const ws = await page.request.post("/api/workspaces", { data: { name: `Fields WS ${stamp}` } });
  expect(ws.ok(), await ws.text()).toBeTruthy();
  const workspaceId = (await ws.json()).workspace.id as string;
  const pr = await page.request.post(`/api/workspaces/${workspaceId}/projects`, { data: { name: `Fields ${stamp}` } });
  expect(pr.ok()).toBeTruthy();
  const projectId = (await pr.json()).project.id as string;

  // Number field via API (validation), dropdown via the UI.
  const bad = await page.request.post(`/api/projects/${projectId}/custom-fields`, { data: { name: "Tier", type: "DROPDOWN", options: [] } });
  expect(bad.status()).toBe(400);
  const budgetRes = await page.request.post(`/api/projects/${projectId}/custom-fields`, { data: { name: "Budget", type: "NUMBER" } });
  expect(budgetRes.status()).toBe(201);
  const budget = (await budgetRes.json()).field as { id: string };

  const detail = await (await page.request.get(`/api/projects/${projectId}`)).json();
  const sectionId = detail.project.sections[0].id as string;
  const mk = async (title: string) => {
    const res = await page.request.post("/api/tasks", {
      data: { title, status: "PENDING", priority: "MEDIUM", workspaceId, projectId, sectionId, assigneeIds: [] },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    return (await res.json()).task.id as string;
  };
  const alpha = await mk(`Alpha ${stamp}`);
  await mk(`Beta ${stamp}`);
  const badValue = await page.request.put(`/api/tasks/${alpha}/custom-fields`, { data: { fieldId: budget.id, value: "lots" } });
  expect(badValue.status()).toBe(400);

  await page.goto(`/dashboard/projects/${projectId}`);
  await expect(page.getByRole("heading", { name: `Fields ${stamp}`, level: 1 })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("tab", { name: "List" }).click();

  await page.getByRole("button", { name: "Fields", exact: true }).click();
  const dialog = page.getByTestId("custom-fields-dialog");
  await dialog.getByLabel("Field name").fill("Client tier");
  await dialog.getByLabel("Type").selectOption("DROPDOWN");
  await dialog.getByLabel("Options (comma separated)").fill("Gold, Silver");
  const created = page.waitForResponse((r) => r.url().endsWith(`/api/projects/${projectId}/custom-fields`) && r.request().method() === "POST");
  await dialog.getByRole("button", { name: "Add field" }).click();
  expect((await created).status()).toBe(201);
  await expect(dialog.getByTestId("custom-field-row")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("custom-fields-dialog")).toHaveCount(0);

  // Set values on Alpha in the side panel; wait for each PUT, not toast text.
  const card = page.getByTestId("project-task-card").filter({ hasText: `Alpha ${stamp}` });
  await card.getByText("MEDIUM").click();
  const panel = page.getByRole("dialog");
  const fields = panel.getByTestId("task-custom-fields");
  await expect(fields).toBeVisible({ timeout: 20_000 });
  let put = page.waitForResponse((r) => r.url().endsWith(`/api/tasks/${alpha}/custom-fields`) && r.request().method() === "PUT");
  await fields.getByLabel("Client tier").selectOption("Gold");
  expect((await put).ok()).toBeTruthy();
  put = page.waitForResponse((r) => r.url().endsWith(`/api/tasks/${alpha}/custom-fields`) && r.request().method() === "PUT");
  await fields.getByLabel("Budget").fill("150000");
  await fields.getByLabel("Budget").press("Enter");
  expect((await put).ok()).toBeTruthy();
  if (proof) {
    await fields.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${proof}/custom-fields-side-panel.png` });
  }
  await panel.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Chips on the list row.
  const alphaCard = page.getByTestId("project-task-card").filter({ hasText: `Alpha ${stamp}` });
  await expect(alphaCard.getByTestId("custom-field-chip")).toHaveCount(2, { timeout: 20_000 });
  await expect(alphaCard).toContainText("Client tier: Gold");
  await expect(alphaCard).toContainText("Budget: 1,50,000");

  // Filter: Client tier is Gold -> only Alpha.
  const filter = page.getByTestId("custom-field-filter");
  await filter.getByLabel("Filter by field").selectOption({ label: "Client tier" });
  await filter.getByLabel("Filter value").selectOption("Gold");
  await expect(page.getByTestId("project-task-card")).toHaveCount(1);
  await expect(filter.getByTestId("custom-field-filter-count")).toHaveText("1 of 2 tasks");
  if (proof) await page.screenshot({ path: `${proof}/custom-fields-list-filter.png`, fullPage: true });
  // Budget is empty -> only Beta.
  await filter.getByLabel("Filter by field").selectOption({ label: "Budget" });
  await filter.getByLabel("Filter condition").selectOption("empty");
  await expect(page.getByTestId("project-task-card")).toHaveCount(1);
  await expect(page.getByTestId("project-task-card")).toContainText(`Beta ${stamp}`);
  await filter.getByLabel("Clear field filter").click();
  await expect(page.getByTestId("project-task-card")).toHaveCount(2);

  // Deleting a field removes its chips.
  const del = await page.request.delete(`/api/projects/${projectId}/custom-fields/${budget.id}`);
  expect(del.ok()).toBeTruthy();
  const after = await (await page.request.get(`/api/tasks/${alpha}/custom-fields`)).json();
  expect(after.fields.map((f: { name: string }) => f.name)).toEqual(["Client tier"]);
  expect(after.values).toEqual([{ fieldId: after.fields[0].id, value: "Gold" }]);
});
