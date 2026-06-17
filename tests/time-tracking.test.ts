import { describe, expect, it } from "vitest";
import {
  computeElapsedSeconds,
  formatDurationHms,
  formatDurationShort,
  parseDurationInput,
  parseDurationText,
  resolveTimeRange,
} from "@/lib/time-format";
import {
  timeManualSchema,
  timeStartSchema,
  timeStopSchema,
  timeQuerySchema,
} from "@/lib/validations";

describe("time-format", () => {
  it("computes elapsed seconds", () => {
    const start = new Date("2026-01-01T10:00:00Z");
    const end = new Date("2026-01-01T11:30:00Z");
    expect(computeElapsedSeconds(start, end)).toBe(5400);
  });

  it("formats HMS duration", () => {
    expect(formatDurationHms(3661)).toBe("01:01:01");
    expect(formatDurationHms(0)).toBe("00:00:00");
  });

  it("formats short duration", () => {
    expect(formatDurationShort(5400)).toBe("1h 30m");
    expect(formatDurationShort(45)).toBe("45s");
  });

  it("parses duration input", () => {
    expect(parseDurationInput(2, 15)).toBe(8100);
  });

  it("parses duration text", () => {
    expect(parseDurationText("2h 15m")).toBe(8100);
    expect(parseDurationText("01:15:00")).toBe(4500);
  });

  it("resolves today range", () => {
    const { from, to } = resolveTimeRange("today");
    expect(from).toBeTruthy();
    expect(to).toBeTruthy();
    expect(from!.getHours()).toBe(0);
  });
});

describe("time validations", () => {
  it("validates start schema", () => {
    const result = timeStartSchema.safeParse({ taskId: "task_1", description: "Work" });
    expect(result.success).toBe(true);
  });

  it("validates stop schema with optional description and taskStatus", () => {
    const minimal = timeStopSchema.safeParse({ timeEntryId: "entry_1" });
    expect(minimal.success).toBe(true);

    const withNote = timeStopSchema.safeParse({
      timeEntryId: "entry_1",
      description: "Finished feature work",
    });
    expect(withNote.success).toBe(true);

    const withStatus = timeStopSchema.safeParse({
      timeEntryId: "entry_1",
      taskStatus: "COMPLETED",
    });
    expect(withStatus.success).toBe(true);

    const invalidStatus = timeStopSchema.safeParse({
      timeEntryId: "entry_1",
      taskStatus: "DONE",
    });
    expect(invalidStatus.success).toBe(false);
  });

  it("validates manual schema minimum duration", () => {
    const fail = timeManualSchema.safeParse({
      taskId: "t1",
      date: new Date().toISOString(),
      durationSeconds: 30,
    });
    expect(fail.success).toBe(false);

    const ok = timeManualSchema.safeParse({
      taskId: "t1",
      date: new Date().toISOString(),
      durationSeconds: 3600,
    });
    expect(ok.success).toBe(true);
  });

  it("validates query schema defaults", () => {
    const result = timeQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.range).toBe("all");
    }
  });

  it("validates personal report query params", () => {
    const result = timeQuerySchema.safeParse({
      personal: "true",
      includeReport: "true",
      range: "month",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.personal).toBe(true);
      expect(result.data.includeReport).toBe(true);
      expect(result.data.range).toBe("month");
    }
  });
});

describe("manual entry duration", () => {
  it("calculates start from end date and duration", () => {
    const durationSeconds = 8100;
    const end = new Date("2026-05-12T12:00:00Z");
    const start = new Date(end.getTime() - durationSeconds * 1000);
    expect(computeElapsedSeconds(start, end)).toBe(durationSeconds);
  });
});
