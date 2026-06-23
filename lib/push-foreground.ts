/** Skip Web Push only while a visible tab is actively heartbeating (see heartbeat interval). */
export const PUSH_FOREGROUND_WINDOW_MS = 7_000;

/** How often a visible tab refreshes foreground state (must be less than PUSH_FOREGROUND_WINDOW_MS). */
export const PUSH_FOREGROUND_HEARTBEAT_MS = 5_000;

export function isPushForegroundActive(pushForegroundAt: Date | null | undefined): boolean {
  if (!pushForegroundAt) return false;
  return Date.now() - pushForegroundAt.getTime() < PUSH_FOREGROUND_WINDOW_MS;
}
