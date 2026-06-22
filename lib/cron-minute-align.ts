/** Milliseconds until the next wall-clock minute boundary (e.g. :00.000). */
export function msUntilNextMinute(now = Date.now()): number {
  const remainder = now % 60_000;
  return remainder === 0 ? 0 : 60_000 - remainder;
}

/**
 * Runs `tick` at each minute boundary, then every 60s thereafter.
 * Returns a disposer that clears the pending timeout and interval.
 */
export function startMinuteAlignedInterval(tick: () => void | Promise<void>) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const runTick = () => {
    void Promise.resolve(tick()).catch((error) => {
      console.error("[cron] Minute-aligned tick error:", error);
    });
  };

  const startInterval = () => {
    runTick();
    intervalId = setInterval(runTick, 60_000);
  };

  const delay = msUntilNextMinute();
  if (delay === 0) {
    startInterval();
  } else {
    timeoutId = setTimeout(startInterval, delay);
  }

  return () => {
    if (timeoutId) clearTimeout(timeoutId);
    if (intervalId) clearInterval(intervalId);
    timeoutId = null;
    intervalId = null;
  };
}
