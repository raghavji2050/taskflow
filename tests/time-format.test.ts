import { describe, expect, it } from "vitest";
import {
  formatEstimateMinutes,
  formatLoggedVsEstimated,
  hoursMinutesToMinutes,
  isOverEstimate,
  minutesToHoursMinutes,
} from "@/lib/time-format";

describe("time-format estimates", () => {
  it("formats estimate minutes as duration", () => {
    expect(formatEstimateMinutes(120)).toBe("2h");
    expect(formatEstimateMinutes(90)).toBe("1h 30m");
  });

  it("formats logged vs estimated when estimate is set", () => {
    expect(formatLoggedVsEstimated(4020, 120)).toBe("1h 7m / 2h");
  });

  it("formats logged only when no estimate", () => {
    expect(formatLoggedVsEstimated(3600, null)).toBe("1h");
    expect(formatLoggedVsEstimated(3600, undefined)).toBe("1h");
    expect(formatLoggedVsEstimated(3600, 0)).toBe("1h");
  });

  it("detects over estimate", () => {
    expect(isOverEstimate(7800, 120)).toBe(true);
    expect(isOverEstimate(7200, 120)).toBe(false);
    expect(isOverEstimate(7200, null)).toBe(false);
  });

  it("converts between minutes and hours/minutes", () => {
    expect(minutesToHoursMinutes(125)).toEqual({ hours: 2, minutes: 5 });
    expect(hoursMinutesToMinutes(2, 5)).toBe(125);
    expect(hoursMinutesToMinutes(0, 0)).toBeNull();
  });
});
