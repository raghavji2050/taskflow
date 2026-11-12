import { test, expect } from "@playwright/test";
import { BACKUP_TOKEN, deleteBackup, dummyDump, ip, signInAs, uploadBackup } from "./backup-helpers";

// Phone layout of the Backups page. Throwaway CI DB + local backup folder only.
test.use({ extraHTTPHeaders: { "x-test-client-ip": ip() } });
const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test.skip(!BACKUP_TOKEN, "TASKFLOW_BACKUP_TOKEN not set for this run");

test("Backups page fits a phone and the download button is tappable", async ({ page, request }) => {
  const filename = `e2e_${stamp}_mobile_2026-11-12_0315.sql.gz`;
  const done = await uploadBackup(request, filename, dummyDump(`m-${stamp}`));
  try {
    await signInAs(page, "Backup Admin Mobile", "backup-admin-mobile@example.com");
    await page.goto("/dashboard/backups");
    await expect(page.getByRole("heading", { name: "Database backups" })).toBeVisible();
    const row = page.getByTestId("backup-row").filter({ hasText: filename });
    await expect(row).toBeVisible();
    const btn = row.getByRole("link", { name: `Download ${filename}` });
    const box = await btn.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    const vw = page.viewportSize()!.width;
    expect(box!.x + box!.width).toBeLessThanOrEqual(vw + 1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  } finally {
    await deleteBackup(request, done.backup.pathname);
  }
});
