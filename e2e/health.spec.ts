import { expect, test } from "@playwright/test";

test("health endpoint reports ok with database latency and request id", async ({ request }) => {
  const res = await request.get("/api/health", { headers: { "x-request-id": "e2e-health-check" } });
  expect(res.status()).toBe(200);
  expect(res.headers()["x-request-id"]).toBe("e2e-health-check");
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(body.db.ok).toBe(true);
  expect(typeof body.db.latencyMs).toBe("number");
  expect(body.requestId).toBe("e2e-health-check");
});
