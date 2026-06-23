import { describe, it, expect } from "vitest";
import {
  isPushForegroundActive,
  PUSH_FOREGROUND_HEARTBEAT_MS,
  PUSH_FOREGROUND_WINDOW_MS,
} from "@/lib/push-foreground";

describe("push-foreground", () => {
  it("treats recent foreground heartbeat as active", () => {
    const at = new Date(Date.now() - 2_000);
    expect(isPushForegroundActive(at)).toBe(true);
  });

  it("treats stale foreground heartbeat as inactive", () => {
    const at = new Date(Date.now() - PUSH_FOREGROUND_WINDOW_MS - 1);
    expect(isPushForegroundActive(at)).toBe(false);
  });

  it("treats null as inactive", () => {
    expect(isPushForegroundActive(null)).toBe(false);
    expect(isPushForegroundActive(undefined)).toBe(false);
  });

  it("heartbeat interval is shorter than foreground window", () => {
    expect(PUSH_FOREGROUND_HEARTBEAT_MS).toBeLessThan(PUSH_FOREGROUND_WINDOW_MS);
  });
});
