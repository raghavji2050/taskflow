import { afterEach, describe, expect, it, vi } from "vitest";
import { formatLogLine, log } from "@/lib/logger";
import { getOrCreateRequestId } from "@/lib/request-id";
import { reportQueryDuration, slowQueryThresholdMs } from "@/lib/slow-query";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("formatLogLine", () => {
  it("emits one JSON line with level, msg, time and fields", () => {
    const entry = JSON.parse(formatLogLine("info", "hello", { requestId: "abc12345", skip: undefined }));
    expect(entry.level).toBe("info");
    expect(entry.msg).toBe("hello");
    expect(entry.requestId).toBe("abc12345");
    expect("skip" in entry).toBe(false);
    expect(typeof entry.time).toBe("string");
  });

  it("serializes errors", () => {
    const entry = JSON.parse(formatLogLine("error", "boom", { error: new Error("bad") }));
    expect(entry.error.message).toBe("bad");
    expect(entry.error.name).toBe("Error");
  });

  it("survives circular fields", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(JSON.parse(formatLogLine("warn", "circ", { a })).note).toBe("unserializable fields");
  });
});

describe("log level filtering", () => {
  it("drops levels below LOG_LEVEL", () => {
    vi.stubEnv("LOG_LEVEL", "warn");
    const info = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    log("info", "quiet");
    log("warn", "loud");
    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("getOrCreateRequestId", () => {
  it("reuses a safe inbound id", () => {
    expect(getOrCreateRequestId(new Headers({ "x-request-id": "req-12345678" }))).toBe("req-12345678");
  });

  it("falls back to x-vercel-id", () => {
    expect(getOrCreateRequestId(new Headers({ "x-vercel-id": "sin1::abcd-1234" }))).toBe("sin1::abcd-1234");
  });

  it("rejects unsafe ids and generates a uuid", () => {
    const id = getOrCreateRequestId(new Headers({ "x-request-id": "bad id <script>" }));
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("slow query reporting", () => {
  it("uses 500ms default and env override", () => {
    expect(slowQueryThresholdMs()).toBe(500);
    vi.stubEnv("SLOW_QUERY_MS", "250");
    expect(slowQueryThresholdMs()).toBe(250);
  });

  it("logs only queries at or above the threshold", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(reportQueryDuration("Task", "findMany", 100, 500)).toBe(false);
    expect(reportQueryDuration("Task", "findMany", 812.4, 500)).toBe(true);
    const entry = JSON.parse(warn.mock.calls[0][0] as string);
    expect(entry).toMatchObject({ msg: "slow prisma query", model: "Task", action: "findMany", durationMs: 812 });
  });
});
