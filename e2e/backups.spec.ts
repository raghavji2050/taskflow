import { test, expect } from "@playwright/test";
import { BACKUP_TOKEN, deleteBackup, dummyDump, ip, signInAs, uploadBackup } from "./backup-helpers";

// Runs against the throwaway CI MySQL + local backup folder (no Blob token in CI). Never prod.
test.use({ extraHTTPHeaders: { "x-test-client-ip": ip() } });
const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const ADMIN_EMAIL = "backup-admin-e2e@example.com";

test.skip(!BACKUP_TOKEN, "TASKFLOW_BACKUP_TOKEN not set for this run");

test("backup API: token-protected direct upload, verify, list, download, delete", async ({ request }) => {
  // No / wrong token.
  expect((await request.post("/api/backups/upload-token", { data: { filename: "cpdl_2026-11-12_0315.sql.gz" } })).status()).toBe(401);
  expect((await request.post("/api/backups/upload-token", { headers: { Authorization: "Bearer nope" }, data: { filename: "x.sql.gz" } })).status()).toBe(401);
  expect((await request.get("/api/backups", { headers: { Authorization: "Bearer nope" } })).status()).toBe(401);
  expect((await request.get("/api/backups")).status()).toBe(401);
  const auth = { Authorization: `Bearer ${BACKUP_TOKEN}` };
  // Bad names and sizes.
  for (const filename of ["../etc/passwd.gz", "a/b.sql.gz", "dump.sql", ""]) {
    expect((await request.post("/api/backups/upload-token", { headers: auth, data: { filename } })).status()).toBe(400);
  }
  expect((await request.post("/api/backups/upload-token", { headers: auth, data: { filename: "big.sql.gz", size: 10 * 1024 ** 3 } })).status()).toBe(413);
  // curl format is a curl -K config.
  const cfg = await request.post("/api/backups/upload-token?format=curl", { headers: auth, data: { filename: `e2e_${stamp}_cfg.sql.gz` } });
  expect(cfg.status()).toBe(200);
  expect(await cfg.text()).toMatch(/^url = ".+"\nrequest = "PUT"\nheader = /);

  const filename = `e2e_${stamp}_2026-11-12_0315.sql.gz`;
  const body = dummyDump(stamp);
  const done = await uploadBackup(request, filename, body);
  expect(done.backup.pathname).toBe(`backups/cpdl/${filename}`);
  expect(done.backup.size).toBe(body.length);
  expect(done.retention).toBeGreaterThan(0);

  // Wrong size is rejected at complete.
  expect((await request.post("/api/backups/complete", { headers: auth, data: { filename, size: body.length + 1 } })).status()).toBe(409);
  expect((await request.post("/api/backups/complete", { headers: auth, data: { filename: `missing_${stamp}.sql.gz` } })).status()).toBe(404);

  const list = await (await request.get("/api/backups?source=cpdl", { headers: auth })).json();
  const row = list.backups.find((b: { filename: string }) => b.filename === filename);
  expect(row).toBeTruthy();
  expect(JSON.stringify(list)).not.toMatch(/blob\.vercel-storage\.com|"ref"/);

  const dl = await request.get(`/api/backups/download?pathname=${encodeURIComponent(done.backup.pathname)}`, { headers: auth });
  expect(dl.status()).toBe(200);
  expect(Buffer.compare(await dl.body(), body)).toBe(0);
  expect((await request.get(`/api/backups/download?pathname=${encodeURIComponent("task-attachments/x.gz")}`, { headers: auth })).status()).toBe(400);

  await deleteBackup(request, done.backup.pathname);
  expect((await request.get(`/api/backups/download?pathname=${encodeURIComponent(done.backup.pathname)}`, { headers: auth })).status()).toBe(404);
});

test("Backups page: allow-listed admin lists and downloads; others are kept out", async ({ page, browser, request }) => {
  const filename = `e2e_${stamp}_page.sql.gz`;
  const body = dummyDump(`page-${stamp}`);
  const done = await uploadBackup(request, filename, body);
  try {
    await signInAs(page, "Backup Admin", ADMIN_EMAIL);
    expect((await (await page.request.get("/api/backups/access")).json()).allowed).toBe(true);
    await page.goto("/dashboard/backups");
    await expect(page.getByRole("heading", { name: "Database backups" })).toBeVisible();
    // Active page keeps "More" open, so the allow-listed nav link shows.
    await expect(page.getByRole("link", { name: "Backups", exact: true }).first()).toBeVisible({ timeout: 15_000 });
    const row = page.getByTestId("backup-row").filter({ hasText: filename });
    await expect(row).toBeVisible();
    const link = row.getByRole("link", { name: `Download ${filename}` });
    const href = await link.getAttribute("href");
    expect(href).toContain("/api/backups/download?pathname=");
    const dl = await page.request.get(href!);
    expect(dl.status()).toBe(200);
    expect(Buffer.compare(await dl.body(), body)).toBe(0);

    // A normal user: no link, page redirects, APIs refuse.
    const ctx = await browser.newContext({ extraHTTPHeaders: { "x-test-client-ip": ip() } });
    const other = await ctx.newPage();
    await signInAs(other, "Backup Stranger", `backup-stranger-${stamp}@example.com`);
    expect((await (await other.request.get("/api/backups/access")).json()).allowed).toBe(false);
    expect((await other.request.get("/api/backups")).status()).toBe(401);
    expect((await other.request.get(href!)).status()).toBe(401);
    await other.goto("/dashboard/backups");
    await expect(other).not.toHaveURL(/\/backups/);
    await other.goto("/dashboard/trash"); // opens "More" in the sidebar
    await expect(other.getByRole("link", { name: "Trash", exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(other.getByRole("link", { name: "Backups", exact: true })).toHaveCount(0);
    await ctx.close();
  } finally {
    await deleteBackup(request, done.backup.pathname);
  }
});
