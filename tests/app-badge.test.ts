import { describe, expect, it, vi } from "vitest";
import { isAppBadgeSupported, updateAppBadge } from "@/lib/app-badge";

describe("app badge", () => {
  it("is a no-op when unsupported", async () => {
    expect(isAppBadgeSupported({})).toBe(false);
    expect(await updateAppBadge(3, {})).toBe("unsupported");
  });
  it("sets count when unread > 0", async () => {
    const nav = { setAppBadge: vi.fn().mockResolvedValue(undefined), clearAppBadge: vi.fn() };
    expect(await updateAppBadge(4.7, nav)).toBe("set");
    expect(nav.setAppBadge).toHaveBeenCalledWith(4);
  });
  it("clears when zero or invalid", async () => {
    const nav = { setAppBadge: vi.fn(), clearAppBadge: vi.fn().mockResolvedValue(undefined) };
    expect(await updateAppBadge(0, nav)).toBe("cleared");
    expect(await updateAppBadge(NaN, nav)).toBe("cleared");
    expect(nav.clearAppBadge).toHaveBeenCalledTimes(2);
  });
  it("swallows errors", async () => {
    const nav = { setAppBadge: vi.fn().mockRejectedValue(new Error("x")) };
    expect(await updateAppBadge(1, nav)).toBe("unsupported");
  });
});
