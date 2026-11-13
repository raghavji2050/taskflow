import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";

const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
test.use({ extraHTTPHeaders: { "x-test-client-ip": ip() } });

// Runs against a throwaway MySQL database (CI service container). Never prod, never real Stripe.
const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_ci_billing_e2e";
const PRICE_PRO = process.env.STRIPE_PRICE_PRO ?? "price_ci_pro";

async function register(page: Page, name: string, email: string) {
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("e2e-password-123");
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

function signed(event: object) {
  const body = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  return { body, sig: `t=${t},v1=${createHmac("sha256", SECRET).update(`${t}.${body}`).digest("hex")}` };
}

test("workspace billing: free plan, signed Stripe webhooks upgrade and cancel, bad signatures refused", async ({ page }) => {
  await register(page, "Billing Owner", `billing-${stamp}@example.com`);
  const ws = (await (await page.request.post("/api/workspaces", { data: { name: `Billing WS ${stamp}` } })).json()).workspace.id as string;

  const initial = (await (await page.request.get(`/api/workspaces/${ws}/billing`)).json()).billing;
  expect(initial).toMatchObject({ plan: "FREE", canManage: true, configured: false });
  expect(initial.usage.find((u: { kind: string }) => u.kind === "members")).toMatchObject({ used: 1, limit: 5 });

  // No STRIPE_SECRET_KEY in CI: checkout is refused cleanly, never a 500.
  expect((await page.request.post(`/api/workspaces/${ws}/billing/checkout`, { data: { plan: "PRO" } })).status()).toBe(503);
  expect((await page.request.post(`/api/workspaces/${ws}/billing/checkout`, { data: { plan: "FREE" } })).status()).toBe(400);

  // Unsigned / wrongly signed webhooks are rejected.
  const bad = await page.request.post("/api/billing/webhook", { data: "{}", headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=00" } });
  expect(bad.status()).toBe(400);

  const sub = { id: `sub_${stamp}`, customer: `cus_${stamp}`, status: "active", metadata: { workspaceId: ws }, items: { data: [{ price: { id: PRICE_PRO }, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] } };
  const up = signed({ id: `evt_up_${stamp}`, type: "customer.subscription.created", data: { object: sub } });
  const res = await page.request.post("/api/billing/webhook", { data: up.body, headers: { "content-type": "application/json", "stripe-signature": up.sig } });
  expect(res.status()).toBe(200);
  expect((await res.json()).workspaceId).toBe(ws);

  const pro = (await (await page.request.get(`/api/workspaces/${ws}/billing`)).json()).billing;
  expect(pro).toMatchObject({ plan: "PRO", status: "active", hasCustomer: true });
  expect(pro.usage.find((u: { kind: string }) => u.kind === "projects").limit).toBe(50);

  // UI on the Team page shows the plan and usage.
  await page.evaluate((w) => localStorage.setItem("taskflow-workspace", w), ws);
  await page.goto("/dashboard/team");
  await expect(page.getByTestId("billing-plan")).toHaveText("Pro", { timeout: 20_000 });
  await expect(page.getByTestId("billing")).toContainText("Manage billing");

  // Cancel → back to Free (matched by subscription id, no metadata needed).
  const down = signed({ id: `evt_down_${stamp}`, type: "customer.subscription.deleted", data: { object: { ...sub, metadata: {}, status: "canceled" } } });
  expect((await page.request.post("/api/billing/webhook", { data: down.body, headers: { "content-type": "application/json", "stripe-signature": down.sig } })).status()).toBe(200);
  expect((await (await page.request.get(`/api/workspaces/${ws}/billing`)).json()).billing.plan).toBe("FREE");

  // Audit log records the plan change.
  const audit = await (await page.request.get(`/api/audit?workspaceId=${ws}`)).json();
  expect(JSON.stringify(audit.entries)).toContain("workspace.plan_changed");
});
