import { describe, it, expect } from "vitest";
import { getInitials, getPriorityColor, getStatusColor } from "@/lib/utils";

describe("utils", () => {
  it("gets initials from name", () => {
    expect(getInitials("John Doe")).toBe("JD");
    expect(getInitials("Alice")).toBe("A");
  });

  it("returns priority color classes", () => {
    expect(getPriorityColor("HIGH")).toContain("red");
    expect(getPriorityColor("LOW")).toContain("emerald");
  });

  it("returns status color for IN_PROGRESS", () => {
    expect(getStatusColor("IN_PROGRESS")).toContain("violet");
  });
});
