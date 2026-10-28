import { afterEach, describe, expect, it } from "vitest";
import { GET as remindersGET } from "@/app/api/cron/reminders/route";
import { GET as trashGET } from "@/app/api/cron/trash/route";
import { isCronAuthorized } from "@/lib/cron-auth";

const originalSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

describe("isCronAuthorized", () => {
  it("accepts the bearer token Vercel sends", () => {
    expect(isCronAuthorized("Bearer cron-secret", "cron-secret")).toBe(true);
  });

  it("rejects a missing header, a wrong token, and an empty secret", () => {
    expect(isCronAuthorized(null, "cron-secret")).toBe(false);
    expect(isCronAuthorized("Bearer other", "cron-secret")).toBe(false);
    expect(isCronAuthorized("Bearer ", "cron-secret")).toBe(false);
    expect(isCronAuthorized("cron-secret", "cron-secret")).toBe(false);
    expect(isCronAuthorized("Bearer cron-secret", "")).toBe(false);
    expect(isCronAuthorized("Bearer cron-secret", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer undefined", undefined)).toBe(false);
  });
});

describe("cron route auth", () => {
  const routes = [
    ["trash", trashGET, "http://localhost/api/cron/trash"],
    ["reminders", remindersGET, "http://localhost/api/cron/reminders"],
  ] as const;

  it.each(routes)("returns 401 for %s when the bearer token is missing", async (_name, handler, url) => {
    process.env.CRON_SECRET = "cron-secret";
    const response = await handler(new Request(url));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it.each(routes)("returns 401 for %s when the bearer token is wrong", async (_name, handler, url) => {
    process.env.CRON_SECRET = "cron-secret";
    const response = await handler(
      new Request(url, { headers: { authorization: "Bearer not-the-secret" } })
    );
    expect(response.status).toBe(401);
  });

  it.each(routes)("returns 401 for %s when CRON_SECRET is unset", async (_name, handler, url) => {
    delete process.env.CRON_SECRET;
    const response = await handler(
      new Request(url, { headers: { authorization: "Bearer undefined" } })
    );
    expect(response.status).toBe(401);
  });
});
