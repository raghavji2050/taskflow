import { describe, it, expect } from "vitest";
import { addDays } from "date-fns";
import {
  assertScheduledInFuture,
  formatCountdownUntil,
  formatScheduledForShort,
  getMillisUntilScheduled,
  getQuickSchedulePresets,
  isValidTimezone,
  localDateTimeToUtc,
} from "@/lib/schedule-message-time";

describe("schedule-message-time", () => {
  it("validates timezones", () => {
    expect(isValidTimezone("Asia/Kolkata")).toBe(true);
    expect(isValidTimezone("Invalid/Zone")).toBe(false);
  });

  it("converts local date/time to UTC", () => {
    const utc = localDateTimeToUtc("2026-06-24", "09:00", "Asia/Kolkata");
    expect(utc.toISOString()).toBe("2026-06-24T03:30:00.000Z");
  });

  it("rejects schedules less than one minute ahead", () => {
    expect(() => assertScheduledInFuture(new Date(Date.now() + 30_000))).toThrow(
      /at least 1 minute/
    );
  });

  it("formats short labels for today and tomorrow", () => {
    const tz = "UTC";
    const now = new Date("2026-06-22T10:00:00.000Z");
    const todayLater = new Date("2026-06-22T15:00:00.000Z");
    const tomorrow = addDays(now, 1);
    tomorrow.setUTCHours(9, 0, 0, 0);

    expect(formatScheduledForShort(todayLater, tz)).toContain("Today at");
    expect(formatScheduledForShort(tomorrow, tz)).toContain("Tomorrow at");
  });

  it("returns quick schedule presets", () => {
    const now = new Date("2026-06-22T08:00:00.000Z");
    const presets = getQuickSchedulePresets("UTC", now);
    expect(presets.length).toBeGreaterThan(0);
    expect(presets.some((p) => p.id === "30m")).toBe(true);
    expect(presets.some((p) => p.id === "tomorrow-9")).toBe(true);
  });

  it("formats countdown until send", () => {
    const now = new Date("2026-06-22T10:00:00.000Z");
    const in90s = new Date("2026-06-22T10:01:30.000Z");
    expect(formatCountdownUntil(in90s, now)).toBe("1m 30s");
    expect(formatCountdownUntil(new Date("2026-06-22T10:00:30.000Z"), now)).toBe("30s");
    expect(formatCountdownUntil(now, now)).toBe("Sending…");
  });

  it("computes millis until scheduled time", () => {
    const now = new Date("2026-06-22T10:00:00.000Z");
    const target = new Date("2026-06-22T10:02:00.000Z");
    expect(getMillisUntilScheduled(target, now)).toBe(120_000);
  });
});
