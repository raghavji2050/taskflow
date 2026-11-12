import { test, expect, type Page } from "@playwright/test";

const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
test.use({ extraHTTPHeaders: { "x-test-client-ip": ip() } });

// Runs against a throwaway MySQL database (CI service container). Never prod.
const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function register(page: Page, name: string, email: string, path = "/register") {
  await page.goto(path);
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("e2e-password-123");
  await page.getByRole("button", { name: "Create Account" }).click();
}

async function roleOf(page: Page, workspaceId: string, email: string) {
  const data = await (await page.request.get("/api/workspaces")).json();
  const ws = (data.workspaces as Array<{ id: string; members: Array<{ role: string; user: { email: string } }> }>).find((w) => w.id === workspaceId);
  return ws?.members.find((m) => m.user.email === email)?.role ?? null;
}

test("invite link: new user signs up from the link and joins with the chosen role", async ({ page, browser }) => {
  const owner = `inv-owner-${stamp}@example.com`;
  await register(page, "Invite Owner", owner);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  const ws = await page.request.post("/api/workspaces", { data: { name: `Invite WS ${stamp}` } });
  expect(ws.status()).toBe(201);
  const workspaceId = (await ws.json()).workspace.id as string;

  const res = await page.request.post(`/api/workspaces/${workspaceId}/invite-links`, { data: { role: "VIEWER", expiresInDays: 7 } });
  expect(res.status(), await res.text()).toBe(201);
  const { url, link } = await res.json();
  const path = new URL(url).pathname;
  expect(path).toMatch(/^\/join\//);

  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-test-client-ip": ip() } });
  const guest = await ctx.newPage();
  await guest.goto(path);
  await expect(guest.getByRole("heading", { name: `Invite WS ${stamp}` })).toBeVisible();
  await expect(guest.getByText("Viewer", { exact: true })).toBeVisible();
  await guest.getByRole("link", { name: /Create free account/ }).click();
  const guestEmail = `inv-guest-${stamp}@example.com`;
  await expect(guest).toHaveURL(/\/register\?next=/);
  await register(guest, "Invite Guest", guestEmail, guest.url());
  await expect(guest).toHaveURL(new RegExp(path), { timeout: 30_000 });
  await guest.getByRole("button", { name: `Join Invite WS ${stamp}` }).click();
  await expect(guest).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  await expect.poll(() => roleOf(page, workspaceId, guestEmail)).toBe("VIEWER");
  await ctx.close();

  // Link usage counted, then revoke -> link no longer works.
  const list = await (await page.request.get(`/api/workspaces/${workspaceId}/invite-links`)).json();
  const mine = list.links.find((l: { id: string }) => l.id === link.id);
  expect(mine.uses).toBe(1);
  expect((await page.request.delete(`/api/workspaces/${workspaceId}/invite-links/${link.id}`)).ok()).toBeTruthy();
  const preview = await (await page.request.get(`/api/join/${path.split("/").pop()}`)).json();
  expect(preview.valid).toBe(false);

  // Activity log records link created, the join and the revoke.
  const audit = await (await page.request.get(`/api/audit?workspaceId=${workspaceId}`)).json();
  const actions = (audit.entries as Array<{ action: string }>).map((e: { action: string }) => e.action);
  expect(actions).toEqual(expect.arrayContaining(["member.invite_link_created", "member.joined", "member.invite_link_revoked"]));
});

test("email invite carries its role; restricted link rejects other accounts; members cannot mint admin links", async ({ page, browser }) => {
  const owner = `inv2-owner-${stamp}@example.com`;
  await register(page, "Roles Owner", owner);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  const workspaceId = (await (await page.request.post("/api/workspaces", { data: { name: `Roles WS ${stamp}` } })).json()).workspace.id as string;

  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-test-client-ip": ip() } });
  const admin = await ctx.newPage();
  const adminEmail = `inv2-admin-${stamp}@example.com`;
  await register(admin, "Roles Admin", adminEmail);
  await expect(admin).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  // Existing account -> normal invitation with ADMIN role.
  const inv = await page.request.post(`/api/workspaces/${workspaceId}/members`, { data: { email: adminEmail, role: "ADMIN" } });
  expect(inv.status(), await inv.text()).toBe(201);
  const invitationId = (await inv.json()).invitation.id as string;
  expect((await admin.request.post(`/api/invitations/${invitationId}/accept`)).ok()).toBeTruthy();
  await expect.poll(() => roleOf(page, workspaceId, adminEmail)).toBe("ADMIN");

  // No account yet -> email-restricted single-use link.
  const pending = await page.request.post(`/api/workspaces/${workspaceId}/members`, { data: { email: `inv2-later-${stamp}@example.com`, role: "MEMBER" } });
  expect(pending.status(), await pending.text()).toBe(201);
  const pendingBody = await pending.json();
  expect(pendingBody.pendingSignup).toBe(true);
  const links = (await (await page.request.get(`/api/workspaces/${workspaceId}/invite-links`)).json()).links as Array<{ id: string; email: string | null }>;
  expect(links.some((l) => l.email === `inv2-later-${stamp}@example.com`)).toBeTruthy();
  if (pendingBody.inviteUrl) {
    const token = new URL(pendingBody.inviteUrl).pathname.split("/").pop();
    const wrong = await admin.request.post(`/api/join/${token}`);
    expect(wrong.status()).toBe(403);
  }

  // A plain member cannot create an admin link.
  const ctx2 = await browser.newContext({ extraHTTPHeaders: { "x-test-client-ip": ip() } });
  const member = await ctx2.newPage();
  const memberEmail = `inv2-member-${stamp}@example.com`;
  await register(member, "Roles Member", memberEmail);
  await expect(member).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  const m = await page.request.post(`/api/workspaces/${workspaceId}/members`, { data: { email: memberEmail } });
  await member.request.post(`/api/invitations/${(await m.json()).invitation.id}/accept`);
  const bad = await member.request.post(`/api/workspaces/${workspaceId}/invite-links`, { data: { role: "ADMIN" } });
  expect([403, 400]).toContain(bad.status());

  // UI: settings panel shows the invite links card with a role picker.
  await page.evaluate((id) => localStorage.setItem("taskflow-workspace", id), workspaceId);
  await page.goto("/dashboard/team");
  await expect(page.getByTestId("invite-links")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Create link" }).click();
  await expect(page.getByTestId("invite-link-url")).toContainText("/join/");
  await ctx.close();
  await ctx2.close();
});
