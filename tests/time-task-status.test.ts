import { describe, expect, it } from "vitest";
import {
  buildTimerStartStatusUpdate,
  shouldPromoteTaskOnTimerStart,
} from "@/lib/time-task-status";

describe("time-task-status", () => {
  it("promotes PENDING and COMPLETED only", () => {
    expect(shouldPromoteTaskOnTimerStart("PENDING")).toBe(true);
    expect(shouldPromoteTaskOnTimerStart("COMPLETED")).toBe(true);
    expect(shouldPromoteTaskOnTimerStart("IN_PROGRESS")).toBe(false);
  });

  it("builds IN_PROGRESS update from PENDING", () => {
    const update = buildTimerStartStatusUpdate("PENDING");
    expect(update).toEqual({ status: "IN_PROGRESS" });
  });

  it("clears completedAt when reopening from COMPLETED", () => {
    const update = buildTimerStartStatusUpdate("COMPLETED");
    expect(update).toEqual({ status: "IN_PROGRESS", completedAt: null });
  });

  it("returns null when already IN_PROGRESS", () => {
    expect(buildTimerStartStatusUpdate("IN_PROGRESS")).toBeNull();
  });
});
