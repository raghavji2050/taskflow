import { describe, expect, it } from "vitest";
import { dayKey, dueDayParts, isDateOnlyDue } from "@/lib/day";

describe("dueDayParts (shared list/calendar/MCP day rule)", () => {
  it("keeps plain and midnight-UTC dates on their calendar day", () => {
    expect(dueDayParts("2026-11-10", 330)).toEqual({ y: 2026, m: 10, d: 10 });
    expect(dueDayParts("2026-11-10T00:00:00.000Z", -480)).toEqual({ y: 2026, m: 10, d: 10 });
    expect(dueDayParts(new Date("2026-11-10T00:00:00Z"), 330)).toEqual({ y: 2026, m: 10, d: 10 });
    expect(isDateOnlyDue("2026-11-10T00:00:00.000Z")).toBe(true);
  });
  it("puts a timed instant on the user's local day (IST)", () => {
    // 23:56 UTC on 3 Nov = 05:26 IST on 4 Nov — the old bug showed it on 3 Nov.
    expect(dueDayParts("2026-11-03T23:56:00.000Z", 330)).toEqual({ y: 2026, m: 10, d: 4 });
    expect(dueDayParts("2026-11-03T23:56:00.000Z", 0)).toEqual({ y: 2026, m: 10, d: 3 });
    expect(isDateOnlyDue("2026-11-03T23:56:00.000Z")).toBe(false);
  });
  it("orders day keys", () => {
    expect(dayKey({ y: 2026, m: 10, d: 4 })).toBeGreaterThan(dayKey({ y: 2026, m: 10, d: 3 }));
    expect(dueDayParts(null)).toBeNull();
    expect(dueDayParts("garbage")).toBeNull();
  });
});
