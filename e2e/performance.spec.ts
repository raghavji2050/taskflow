import { test, expect } from "@playwright/test";

const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
test.use({ extraHTTPHeaders: { "x-test-client-ip": ip() } });

// Runs against a throwaway MySQL database (CI service container). Never prod.
const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test("task lists revalidate with ETag (304) and workspace tasks paginate", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Name").fill("Perf User");
  await page.getByLabel("Email").fill(`perf-${stamp}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("e2e-password-123");
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  const first = await page.request.get("/api/tasks?limit=20");
  expect(first.status()).toBe(200);
  const etag = first.headers()["etag"];
  expect(etag).toMatch(/^W\//);
  expect(first.headers()["cache-control"]).toBe("private, no-cache");
  expect(first.headers()["server-timing"]).toMatch(/app;dur=/);
  const again = await page.request.get("/api/tasks?limit=20", { headers: { "If-None-Match": etag } });
  expect(again.status()).toBe(304);

  // A change invalidates the tag.
  expect((await page.request.post("/api/tasks", { data: { title: `Perf ${stamp}`, priority: "LOW", status: "PENDING" } })).status()).toBe(201);
  const changed = await page.request.get("/api/tasks?limit=20", { headers: { "If-None-Match": etag } });
  expect(changed.status()).toBe(200);

  // Workspace tasks: bounded pages with hasMore / nextOffset.
  const ws = (await (await page.request.post("/api/workspaces", { data: { name: `Perf WS ${stamp}` } })).json()).workspace.id as string;
  for (let i = 0; i < 3; i++) {
    expect((await page.request.post("/api/tasks", { data: { title: `WS ${i} ${stamp}`, priority: "LOW", status: "PENDING", workspaceId: ws } })).status()).toBe(201);
  }
  const p1 = await (await page.request.get(`/api/workspaces/${ws}/tasks?limit=2`)).json();
  expect(p1.tasks).toHaveLength(2);
  expect(p1.pagination).toMatchObject({ limit: 2, offset: 0, hasMore: true, nextOffset: 2 });
  const p2 = await (await page.request.get(`/api/workspaces/${ws}/tasks?limit=2&offset=2`)).json();
  expect(p2.tasks.length).toBeGreaterThanOrEqual(1);
  expect(p2.pagination.hasMore).toBe(false);
  const ids = new Set([...p1.tasks, ...p2.tasks].map((t: { id: string }) => t.id));
  expect(ids.size).toBe(p1.tasks.length + p2.tasks.length);

  // The dashboard still renders the list normally (browser handles 304 transparently).
  await page.goto("/dashboard");
  await page.reload();
  await expect(page.getByText(`Perf ${stamp}`).first()).toBeVisible({ timeout: 20_000 });
});
