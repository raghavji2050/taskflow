/** Skip Web Push only while a visible tab is actively heartbeating (see heartbeat interval). */
export const PUSH_FOREGROUND_WINDOW_MS = 10_000;

export function isPushForegroundActive(pushForegroundAt: Date | null | undefined): boolean {
  if (!pushForegroundAt) return false;
  return Date.now() - pushForegroundAt.getTime() < PUSH_FOREGROUND_WINDOW_MS;
}
