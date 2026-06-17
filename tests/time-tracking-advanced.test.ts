import { describe, expect, it } from "vitest";
import {
  getEntryElapsedSeconds,
  shouldSendRunningReminder,
  validateSplitSegments,
  computeReminderSnoozeUntil,
} from "@/lib/time-reminder";
import { defaultTimeTrackingPrefs } from "@/lib/time-tracking-prefs";

describe("getEntryElapsedSeconds", () => {
  it("returns duration when paused", () => {
    const entry = {
      duration: 3600,
      startTime: new Date("2026-01-01T10:00:00Z"),
      isRunning: true,
      isPaused: true,
    };
    expect(getEntryElapsedSeconds(entry)).toBe(3600);
  });

  it("adds segment when running", () => {
    const start = new Date(Date.now() - 120_000);
    const entry = {
      duration: 60,
      startTime: start,
      isRunning: true,
      isPaused: false,
    };
    const elapsed = getEntryElapsedSeconds(entry);
    expect(elapsed).toBeGreaterThanOrEqual(180);
    expect(elapsed).toBeLessThan(190);
  });
});

describe("validateSplitSegments", () => {
  it("rejects when sum does not match", () => {
    expect(
      validateSplitSegments(3600, [
        { durationSeconds: 1800 },
        { durationSeconds: 1000 },
      ])
    ).toMatch(/sum/);
  });

  it("accepts valid split", () => {
    expect(
      validateSplitSegments(3600, [
        { durationSeconds: 1800 },
        { durationSeconds: 1800 },
      ])
    ).toBeNull();
  });
});

describe("shouldSendRunningReminder", () => {
  const prefs = { ...defaultTimeTrackingPrefs(), runningReminderHours: 4 };

  it("returns false when snoozed", () => {
    const future = new Date(Date.now() + 3600000);
    expect(
      shouldSendRunningReminder({
        entry: {
          startTime: new Date(Date.now() - 5 * 3600000),
          duration: 5 * 3600,
          isRunning: true,
          isPaused: false,
          lastReminderAt: null,
          reminderSnoozedUntil: future,
        },
        prefs,
      })
    ).toBe(false);
  });

  it("returns true after threshold hours", () => {
    expect(
      shouldSendRunningReminder({
        entry: {
          startTime: new Date(Date.now() - 5 * 3600000),
          duration: 0,
          isRunning: true,
          isPaused: false,
          lastReminderAt: null,
          reminderSnoozedUntil: null,
        },
        prefs,
        now: new Date(),
      })
    ).toBe(true);
  });
});

describe("computeReminderSnoozeUntil", () => {
  it("snoozes by reminder hours when configured", () => {
    const now = new Date("2026-06-17T12:00:00Z");
    const prefs = { ...defaultTimeTrackingPrefs(), runningReminderHours: 4 };
    const until = computeReminderSnoozeUntil(prefs, now);
    expect(until.getTime()).toBe(now.getTime() + 4 * 3600000);
  });
});
