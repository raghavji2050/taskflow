import { test, expect, request as pwRequest, type Page } from "@playwright/test";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { createHmac } from "node:crypto";

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

type Hit = { event: string; signature: string; body: string };
function sink() {
  const hits: Hit[] = [];
  const server = createServer((req: IncomingMessage, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      hits.push({ event: String(req.headers["x-taskflow-event"]), signature: String(req.headers["x-taskflow-signature"]), body });
      res.writeHead(200).end("ok");
    });
  });
  return new Promise<{ url: string; hits: Hit[]; close: () => void }>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`, hits, close: () => server.close() }))
  );
}

const verify = (secret: string, h: Hit) => {
  const { t, v1 } = Object.fromEntries(h.signature.split(",").map((p) => p.split("=")));
  return createHmac("sha256", secret).update(`${t}.${h.body}`).digest("hex") === v1;
};

test("REST v1 with an API token: tasks CRUD, auth errors, webhooks with signed deliveries", async ({ page, browser, baseURL }) => {
  await register(page, "Api Owner", `api-${stamp}@example.com`);
  const token = (await (await page.request.post("/api/user/api-tokens", { data: { name: "e2e" } })).json()).token as string;
  const ws = (await (await page.request.post("/api/workspaces", { data: { name: `Api WS ${stamp}` } })).json()).workspace.id as string;

  const anon = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { "x-test-client-ip": ip() } });
  expect((await anon.get("/api/v1/me")).status()).toBe(401);
  expect((await anon.get("/api/v1/me", { headers: { Authorization: "Bearer tf_notarealtokennotarealtoken" } })).status()).toBe(401);
  const index = await (await anon.get("/api/v1")).json();
  expect(index.version).toBe("v1");

  const api = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer ${token}`, "x-test-client-ip": ip() } });
  expect((await (await api.get("/api/v1/me")).json()).user.email).toBe(`api-${stamp}@example.com`);
  expect((await (await api.get("/api/v1/workspaces")).json()).workspaces.some((w: { id: string }) => w.id === ws)).toBe(true);

  // Webhook to a local sink.
  const s = await sink();
  const created = await api.post(`/api/v1/workspaces/${ws}/webhooks`, { data: { url: s.url, events: ["task.created", "task.completed"] } });
  expect(created.status(), await created.text()).toBe(201);
  const { webhook, secret } = await created.json();
  expect(secret).toMatch(/^whsec_/);
  expect((await (await api.get(`/api/v1/workspaces/${ws}/webhooks`)).json()).webhooks[0].secretHint).not.toContain(secret);
  const ping = await (await api.post(`/api/v1/workspaces/${ws}/webhooks/${webhook.id}/test`)).json();
  expect(ping.ok).toBe(true);
  expect(s.hits[0].event).toBe("ping");
  expect(verify(secret, s.hits[0])).toBe(true);

  // Tasks CRUD.
  const bad = await api.post("/api/v1/tasks", { data: { title: "" } });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error.message).toContain("title");
  const c = await api.post("/api/v1/tasks", { data: { title: `API task ${stamp}`, priority: "HIGH", workspaceId: ws } });
  expect(c.status(), await c.text()).toBe(201);
  const taskId = (await c.json()).task.id as string;
  await expect.poll(() => s.hits.filter((h) => h.event === "task.created").length, { timeout: 15_000 }).toBe(1);
  const createdHit = s.hits.find((h) => h.event === "task.created")!;
  expect(verify(secret, createdHit)).toBe(true);
  expect(JSON.parse(createdHit.body).data.task).toMatchObject({ id: taskId, title: `API task ${stamp}`, workspaceId: ws });

  const list = await (await api.get(`/api/v1/tasks?workspaceId=${ws}&limit=10`)).json();
  expect(list.tasks.map((t: { id: string }) => t.id)).toContain(taskId);
  const upd = await api.patch(`/api/v1/tasks/${taskId}`, { data: { status: "COMPLETED" } });
  expect(upd.status(), await upd.text()).toBe(200);
  await expect.poll(() => s.hits.some((h) => h.event === "task.completed"), { timeout: 15_000 }).toBe(true);
  expect(s.hits.some((h) => h.event === "task.updated")).toBe(false); // not subscribed
  expect((await (await api.get(`/api/v1/tasks/${taskId}`)).json()).task.status).toBe("COMPLETED");
  expect((await api.delete(`/api/v1/tasks/${taskId}`)).status()).toBe(200);
  const deliveries = await (await api.get(`/api/v1/workspaces/${ws}/webhooks/${webhook.id}/deliveries`)).json();
  expect(deliveries.deliveries.length).toBeGreaterThanOrEqual(3);

  // Someone else's token can't see this workspace's tasks or hooks.
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-test-client-ip": ip() } });
  const other = await ctx.newPage();
  await register(other, "Api Other", `api-o-${stamp}@example.com`);
  const otherToken = (await (await other.request.post("/api/user/api-tokens", { data: { name: "e2e" } })).json()).token as string;
  const api2 = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer ${otherToken}`, "x-test-client-ip": ip() } });
  expect((await api2.get(`/api/v1/tasks/${taskId}`)).status()).toBe(404);
  expect((await api2.get(`/api/v1/workspaces/${ws}/webhooks`)).status()).toBe(404);
  // Private URLs are refused unless the test flag is on (it is here), https is still required in prod (unit tested).

  // UI: Team page lists the webhook; remove via API cleans up.
  await page.evaluate((w) => localStorage.setItem("taskflow-workspace", w), ws);
  await page.goto("/dashboard/team");
  await expect(page.getByTestId("webhooks")).toContainText(s.url, { timeout: 20_000 });
  expect((await api.delete(`/api/v1/workspaces/${ws}/webhooks/${webhook.id}`)).status()).toBe(200);
  s.close();
  await Promise.all([anon.dispose(), api.dispose(), api2.dispose(), ctx.close()]);
});
