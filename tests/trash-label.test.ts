import { describe, expect, it } from "vitest";
import { trashPurgeLabel } from "@/lib/trash-policy";

describe("trashPurgeLabel", () => {
  it("shows deletedAt + 30 days", () => {
    expect(trashPurgeLabel("2026-10-28T12:00:00.000Z")).toBe("Deletes on Nov 27, 2026");
  });
  it("accepts a Date and custom retention", () => {
    expect(trashPurgeLabel(new Date("2026-01-01T12:00:00.000Z"), 7)).toBe("Deletes on Jan 8, 2026");
  });
});
