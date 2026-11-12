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

test("audit log records workspace and account events with the right visibility", async ({ page, browser }) => {
  const memberEmail = `audit-member-${stamp}@example.com`;
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-test-client-ip": ip() } });
  const member = await ctx.newPage();
  await register(member, "Audit Member", memberEmail);

  await register(page, "Audit Owner", `audit-${stamp}@example.com`);
  const ws = await page.request.post("/api/workspaces", { data: { name: `Audit WS ${stamp}` } });
  const workspaceId = (await ws.json()).workspace.id as string;
  const proj = await page.request.post(`/api/workspaces/${workspaceId}/projects`, { data: { name: `Audit Project ${stamp}` } });
  const projectId = (await proj.json()).project.id as string;
  const task = await page.request.post("/api/tasks", { data: { title: `Audit task ${stamp}`, priority: "LOW", status: "PENDING", workspaceId, projectId } });
  const taskId = (await task.json()).task.id as string;
  expect((await page.request.delete(`/api/tasks/${taskId}`)).ok()).toBeTruthy();
  const tok = await page.request.post("/api/user/api-tokens", { data: { name: `audit token ${stamp}` } });
  expect(tok.status()).toBe(201);

  // Invite + accept -> member.invited / member.joined.
  const inv = await page.request.post(`/api/workspaces/${workspaceId}/members`, { data: { email: memberEmail } });
  expect(inv.ok(), await inv.text()).toBeTruthy();
  const inviteId = (await inv.json()).invitation.id as string;
  expect((await member.request.post(`/api/invitations/${inviteId}/accept`)).ok()).toBeTruthy();

  const log = await (await page.request.get(`/api/audit?workspaceId=${workspaceId}`)).json();
  expect(log.scope).toBe("workspace");
  const actions = log.entries.map((e: { action: string }) => e.action);
  expect(actions).toEqual(expect.arrayContaining(["workspace.created", "project.created", "task.created", "task.deleted", "member.invited", "member.joined"]));
  expect(log.entries.find((e: { action: string }) => e.action === "task.deleted").targetLabel).toBe(`Audit task ${stamp}`);

  // Members only see their own actions; strangers get 404; account log holds the token.
  const mine = await (await member.request.get(`/api/audit?workspaceId=${workspaceId}`)).json();
  expect(mine.scope).toBe("mine");
  expect(mine.entries.map((e: { action: string }) => e.action)).toEqual(["member.joined"]);
  const account = await (await page.request.get("/api/audit?category=security")).json();
  expect(account.entries[0]).toMatchObject({ action: "token.created", targetLabel: `audit token ${stamp}` });
  await ctx.close();
  const csv = await page.request.get(`/api/audit?workspaceId=${workspaceId}&format=csv`);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("Moved task to trash");

  // UI
  await page.evaluate((id) => localStorage.setItem("taskflow-workspace", id), workspaceId);
  await page.goto("/dashboard/activity");
  const list = page.getByRole("list", { name: "Activity entries" });
  await expect(list.getByText(`Audit task ${stamp}`).first()).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Filter by type").selectOption("members");
  await expect(list.getByText("joined workspace")).toBeVisible();
  await expect(list.getByText(`Audit task ${stamp}`)).toHaveCount(0);
});
