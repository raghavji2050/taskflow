import { describe, expect, it } from "vitest";
import {
  canManageGroupSettings,
  canRemoveMember,
  roleLabel,
} from "@/lib/group-permissions";

describe("group-permissions", () => {
  it("allows owner and admin to manage settings", () => {
    expect(canManageGroupSettings("OWNER")).toBe(true);
    expect(canManageGroupSettings("ADMIN")).toBe(true);
    expect(canManageGroupSettings("MEMBER")).toBe(false);
  });

  it("enforces remove-member rules", () => {
    expect(canRemoveMember("OWNER", "MEMBER")).toBe(true);
    expect(canRemoveMember("OWNER", "ADMIN")).toBe(true);
    expect(canRemoveMember("ADMIN", "MEMBER")).toBe(true);
    expect(canRemoveMember("ADMIN", "ADMIN")).toBe(false);
    expect(canRemoveMember("ADMIN", "OWNER")).toBe(false);
    expect(canRemoveMember("MEMBER", "MEMBER")).toBe(false);
  });

  it("labels roles", () => {
    expect(roleLabel("OWNER")).toBe("Owner");
    expect(roleLabel("ADMIN")).toBe("Admin");
    expect(roleLabel("MEMBER")).toBe(null);
  });
});
