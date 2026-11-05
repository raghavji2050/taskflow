import { test, expect } from "@playwright/test";

// Phone: project views + task side panel (full-height sheet). Throwaway DB only.
test.use({ extraHTTPHeaders: { "x-test-client-ip": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
test.describe.configure({ mode: "serial", timeout: 120_000 });

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const user = { name: "Views Mobile", email: `pviewm-${stamp}@example.com`, password: "e2e-password-123" };

test("phone: overview, calendar agenda, timeline, and the task panel autosaves", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  const ws = await page.request.post("/api/workspaces", { data: { name: `Views M ${stamp}` } });
  const workspaceId = (await ws.json()).workspace.id;
  const pr = await page.request.post(`/api/workspaces/${workspaceId}/projects`, { data: { name: `QA VM ${stamp}` } });
  const projectId = (await pr.json()).project.id;
  const detail = await (await page.request.get(`/api/projects/${projectId}`)).json();
  const now = new Date();
  const due = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const t = await page.request.post("/api/tasks", {
    data: { title: `Phone dated ${stamp}`, status: "PENDING", priority: "HIGH", workspaceId, projectId, sectionId: detail.project.sections[0].id, dueDate: due, assigneeIds: [] },
  });
  expect(t.ok()).toBeTruthy();

  await page.goto(`/dashboard/projects/${projectId}`);
  const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(page.getByTestId("overview-total")).toHaveText("1", { timeout: 20_000 });
  await noOverflow();
  await page.getByRole("tab", { name: "Timeline" }).click();
  await expect(page.getByTestId("project-timeline")).toContainText(`Phone dated ${stamp}`);
  await page.getByRole("tab", { name: "Calendar" }).click();
  const cal = page.getByTestId("project-calendar");
  await noOverflow();
  await cal.getByRole("button", { name: `Phone dated ${stamp}` }).filter({ visible: true }).click();

  const panel = page.getByRole("dialog");
  await expect(panel.getByTestId("task-panel-work")).toBeAttached();
  const box = (await panel.boundingBox())!;
  expect(box.width).toBeGreaterThan(page.viewportSize()!.width * 0.9);
  const saved = page.waitForResponse((r) => /\/api\/tasks\/[^/]+$/.test(r.url()) && r.request().method() === "PUT");
  await panel.getByLabel("Title").fill(`Phone dated ${stamp} edited`);
  expect((await saved).ok()).toBeTruthy();
  if (process.env.E2E_PROOF_DIR) await page.screenshot({ path: `${process.env.E2E_PROOF_DIR}/feat-side-panel-${test.info().project.name}.png` });
  await panel.getByRole("button", { name: "Done" }).click();
  await expect(cal.getByRole("button", { name: `Phone dated ${stamp} edited` }).filter({ visible: true })).toBeVisible();
});
