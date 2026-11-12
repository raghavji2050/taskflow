import { describe, expect, it } from "vitest";
import { canGrantRole, clampExpiryDays, emailMatches, inviteLinkState } from "@/lib/invite-link-rules";

const base = { expiresAt: new Date("2026-11-20T00:00:00Z"), revokedAt: null as Date | null, maxUses: null as number | null, uses: 0 };
const now = new Date("2026-11-12T00:00:00Z");

describe("invite link rules", () => {
  it("states", () => {
    expect(inviteLinkState(base, now)).toBe("active");
    expect(inviteLinkState({ ...base, revokedAt: now }, now)).toBe("revoked");
    expect(inviteLinkState({ ...base, expiresAt: now }, now)).toBe("expired");
    expect(inviteLinkState({ ...base, maxUses: 1, uses: 1 }, now)).toBe("used_up");
    expect(inviteLinkState({ ...base, maxUses: 5, uses: 4 }, now)).toBe("active");
  });
  it("only owners/admins grant admin", () => {
    expect(canGrantRole("OWNER", "ADMIN")).toBe(true);
    expect(canGrantRole("ADMIN", "ADMIN")).toBe(true);
    expect(canGrantRole("MEMBER", "ADMIN")).toBe(false);
    expect(canGrantRole("MEMBER", "VIEWER")).toBe(true);
  });
  it("clamps expiry and matches emails case-insensitively", () => {
    expect(clampExpiryDays(undefined)).toBe(7);
    expect(clampExpiryDays(0)).toBe(7);
    expect(clampExpiryDays(99)).toBe(30);
    expect(clampExpiryDays(0.4)).toBe(1);
    expect(emailMatches(null, "a@b.com")).toBe(true);
    expect(emailMatches(" A@B.com ", "a@b.COM")).toBe(true);
    expect(emailMatches("x@b.com", "a@b.com")).toBe(false);
  });
});
