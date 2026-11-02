/**
 * Home-screen app icon badge (Badging API). Feature-detected; no-op where
 * unsupported. iOS 16.4+ needs the PWA installed + notification permission.
 */
type BadgeNavigator = {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export function isAppBadgeSupported(nav: unknown = typeof navigator !== "undefined" ? navigator : undefined): boolean {
  return !!nav && typeof (nav as BadgeNavigator).setAppBadge === "function";
}

export async function updateAppBadge(
  unreadCount: number,
  nav: unknown = typeof navigator !== "undefined" ? navigator : undefined
): Promise<"set" | "cleared" | "unsupported"> {
  if (!isAppBadgeSupported(nav)) return "unsupported";
  const n = nav as BadgeNavigator;
  const count = Number.isFinite(unreadCount) ? Math.max(0, Math.floor(unreadCount)) : 0;
  try {
    if (count > 0) {
      await n.setAppBadge!(count);
      return "set";
    }
    if (n.clearAppBadge) await n.clearAppBadge();
    else await n.setAppBadge!(0);
    return "cleared";
  } catch {
    return "unsupported";
  }
}
