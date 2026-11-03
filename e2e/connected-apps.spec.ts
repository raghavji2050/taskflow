import { test, expect, type APIRequestContext } from "@playwright/test";
import { createHash, randomBytes } from "crypto";

// Runs against a throwaway MySQL database (CI service container). Never prod.
const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const user = { name: "OAuth User", email: `oauth-${stamp}@example.com`, password: "e2e-password-123" };
const REDIRECT = "http://localhost:4567/callback";

const mcpInit = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } },
};

function callMcp(request: APIRequestContext, token?: string) {
  return request.post("/api/mcp", {
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    data: mcpInit,
  });
}

test("OAuth app can use MCP until it is disconnected in Settings", async ({ page, baseURL }) => {
  // No token: rejected with an OAuth challenge.
  const anon = await callMcp(page.request);
  expect(anon.status()).toBe(401);
  expect(anon.headers()["www-authenticate"]).toContain("resource_metadata=");

  await page.goto("/register");
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  // Dynamic client registration + PKCE consent + token exchange.
  const reg = await page.request.post("/oauth/register", {
    data: { client_name: "E2E Connector", redirect_uris: [REDIRECT] },
  });
  expect(reg.status()).toBe(201);
  const { client_id } = await reg.json();
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const approve = await page.request.post("/oauth/approve", {
    headers: { Origin: baseURL! },
    form: {
      client_id,
      redirect_uri: REDIRECT,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "s1",
      decision: "allow",
    },
    maxRedirects: 0,
  });
  expect(approve.status()).toBe(303);
  const code = new URL(approve.headers()["location"]).searchParams.get("code");
  expect(code).toBeTruthy();
  const tok = await page.request.post("/oauth/token", {
    form: { grant_type: "authorization_code", code: code!, code_verifier: verifier, client_id, redirect_uri: REDIRECT },
  });
  expect(tok.status()).toBe(200);
  const { access_token } = await tok.json();

  // Bad token rejected, real token accepted.
  expect((await callMcp(page.request, "tfo_not-a-real-token")).status()).toBe(401);
  expect((await callMcp(page.request, access_token)).status()).toBe(200);

  // Settings lists the app; disconnecting it kills the token.
  await page.goto("/settings");
  const card = page.getByTestId("connected-apps-card");
  await expect(card.getByText("E2E Connector")).toBeVisible({ timeout: 30_000 });
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Disconnect" }).click();
  await expect(card.getByText("No connected apps.")).toBeVisible({ timeout: 30_000 });
  expect((await callMcp(page.request, access_token)).status()).toBe(401);
});
