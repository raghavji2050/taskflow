import { describe, it, expect, vi, afterEach } from "vitest";
import { msUntilNextMinute, startMinuteAlignedInterval } from "@/lib/cron-minute-align";

describe("cron-minute-align", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 0 at a minute boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T10:05:00.000Z"));
    expect(msUntilNextMinute()).toBe(0);
  });

  it("returns ms until the next minute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T10:05:45.000Z"));
    expect(msUntilNextMinute()).toBe(15_000);
  });

  it("runs tick at minute boundaries", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T10:05:45.000Z"));

    const tick = vi.fn();
    const stop = startMinuteAlignedInterval(tick);

    expect(tick).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(15_000);
    expect(tick).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(2);

    stop();
  });

  it("runs tick immediately when started on a minute boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T10:06:00.000Z"));

    const tick = vi.fn();
    const stop = startMinuteAlignedInterval(tick);

    expect(tick).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(2);

    stop();
  });
});
