/** Soft limit: 40 Giphy proxy calls per user per minute (picker + search). */
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 40;
const hits = new Map<string, number[]>();

export function assertGiphyRateLimit(userId: string) {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const recent = (hits.get(userId) ?? []).filter((t) => t > windowStart);

  if (recent.length >= MAX_REQUESTS) {
    throw new Error("Too many requests. Wait a moment and try again.");
  }

  recent.push(now);
  hits.set(userId, recent);
}
