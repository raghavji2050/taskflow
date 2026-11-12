import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { gzipSync } from "node:zlib";

export const BACKUP_TOKEN = process.env.TASKFLOW_BACKUP_TOKEN ?? "";
export const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const PASSWORD = "e2e-password-123";

/** Admin emails are fixed (BACKUP_ADMIN_EMAILS in CI); register, or log in if a parallel run already did. */
export async function signInAs(page: Page, name: string, email: string) {
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create Account" }).click();
  const ok = await page.waitForURL(/\/dashboard/, { timeout: 15_000 }).then(() => true, () => false);
  if (ok) return;
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

const auth = () => ({ Authorization: `Bearer ${BACKUP_TOKEN}` });

/** Same 3 calls the cpdl script makes: upload-token -> PUT -> complete. */
export async function uploadBackup(request: APIRequestContext, filename: string, body: Buffer) {
  const ticketRes = await request.post("/api/backups/upload-token", { headers: auth(), data: { filename, size: body.length } });
  expect(ticketRes.status(), await ticketRes.text()).toBe(200);
  const ticket = await ticketRes.json();
  expect(ticket.method).toBe("PUT");
  const put = await request.fetch(ticket.uploadUrl, { method: "PUT", headers: ticket.headers, data: body });
  expect(put.status(), await put.text()).toBe(200);
  const done = await request.post("/api/backups/complete", { headers: auth(), data: { filename, size: body.length } });
  expect(done.status(), await done.text()).toBe(200);
  return (await done.json()) as { ok: boolean; backup: { pathname: string; size: number }; kept: number; retention: number };
}

export async function deleteBackup(request: APIRequestContext, pathname: string) {
  await request.delete(`/api/backups?pathname=${encodeURIComponent(pathname)}`, { headers: auth() });
}

export function dummyDump(label: string) {
  return gzipSync(Buffer.from(`-- taskflow e2e dummy dump ${label}\nCREATE TABLE t (id int);\n`.repeat(50)));
}
