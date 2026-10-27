import { readFileSync } from "node:fs";
import { Prisma, type PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  databaseUrlWithPoolDefaults,
  isRetryablePrismaError,
  withPrismaRetry,
} from "@/lib/prisma";

function setNodeEnv(value: string | undefined) {
  (process.env as { NODE_ENV?: string }).NODE_ENV = value;
}

function prismaSlot(): { prisma?: PrismaClient } {
  return globalThis as { prisma?: PrismaClient };
}

describe("prisma connection handling", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("caches the client on globalThis in production", async () => {
    const previousEnv = process.env.NODE_ENV;
    const previousUrl = process.env.DATABASE_URL;
    setNodeEnv("production");
    process.env.DATABASE_URL = "mysql://user:pass@127.0.0.1:3306/todo_app";

    const previous = prismaSlot().prisma;
    prismaSlot().prisma = undefined;
    await previous?.$disconnect().catch(() => undefined);

    const { prisma } = await import("@/lib/prisma");
    void prisma.user;
    const first = prismaSlot().prisma;
    void prisma.task;
    void prisma.document;
    expect(first).toBeDefined();
    expect(prismaSlot().prisma).toBe(first);

    const source = readFileSync("lib/prisma.ts", "utf8");
    expect(source).toContain("globalForPrisma.prisma = client");
    expect(source).not.toMatch(/NODE_ENV\s*!==\s*["']production["']/);

    setNodeEnv(previousEnv);
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    prismaSlot().prisma = undefined;
    await first?.$disconnect().catch(() => undefined);
  });

  it("caps long connect and pool timeouts and keeps an explicit pool size", () => {
    expect(
      databaseUrlWithPoolDefaults(
        "mysql://user:pass@127.0.0.1:3306/todo_app?connection_limit=5&pool_timeout=20&connect_timeout=300"
      )
    ).toBe(
      "mysql://user:pass@127.0.0.1:3306/todo_app?connection_limit=5&pool_timeout=10&connect_timeout=10"
    );
    expect(databaseUrlWithPoolDefaults("mysql://user:pass@127.0.0.1:3306/todo_app")).toBe(
      "mysql://user:pass@127.0.0.1:3306/todo_app?connect_timeout=10&connection_limit=5&pool_timeout=10"
    );
    expect(
      databaseUrlWithPoolDefaults("mysql://user:pass@127.0.0.1:3306/todo_app?connection_limit=2&connect_timeout=5")
    ).toContain("connection_limit=2");
  });

  it("does not retry ordinary query errors or timeouts that already waited", async () => {
    const unique = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
    });
    const timedOut = new Prisma.PrismaClientKnownRequestError("Operation timed out", {
      code: "P1008",
      clientVersion: "test",
    });
    const pool = new Prisma.PrismaClientKnownRequestError("Timed out fetching a new connection", {
      code: "P2024",
      clientVersion: "test",
    });
    for (const error of [unique, timedOut, pool]) {
      let calls = 0;
      await expect(
        withPrismaRetry(async () => {
          calls += 1;
          throw error;
        })
      ).rejects.toBe(error);
      expect(calls).toBe(1);
      expect(isRetryablePrismaError(error)).toBe(false);
    }
  });

  it("retries a dropped connection once, then surfaces the error", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = new Prisma.PrismaClientKnownRequestError("Can't reach database server", {
      code: "P1001",
      clientVersion: "test",
    });
    let calls = 0;
    const pending = withPrismaRetry(async () => {
      calls += 1;
      throw error;
    });
    const assertion = expect(pending).rejects.toBe(error);
    await vi.runAllTimersAsync();
    await assertion;
    expect(calls).toBe(2);
  });

  it("returns the value when the single retry succeeds", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let calls = 0;
    const pending = withPrismaRetry(async () => {
      calls += 1;
      if (calls === 1) throw new Error("ECONNRESET");
      return "ok";
    });
    const assertion = expect(pending).resolves.toBe("ok");
    await vi.runAllTimersAsync();
    await assertion;
    expect(calls).toBe(2);
  });
});

describe("task read hot path", () => {
  it("pins functions to Singapore and keeps the existing build commands", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(config.regions).toEqual(["sin1"]);
    expect(config.buildCommand).toBe("npm run vercel-build");
    expect(config.installCommand).toBe("npm install");
  });

  it("archives stale completed tasks from the daily cron, not GET /api/tasks", () => {
    const tasks = readFileSync("app/api/tasks/route.ts", "utf8");
    const cron = readFileSync("app/api/cron/reminders/route.ts", "utf8");
    expect(tasks).not.toContain("archiveStaleCompletedTasks");
    expect(cron).toContain("archiveStaleCompletedTasks");
    expect(cron).toContain("CRON_SECRET");
  });
});
