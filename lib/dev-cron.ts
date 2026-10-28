/**
 * Runs scheduled-message delivery on an interval during local development.
 * GET /api/cron/scheduled-messages does the same work, but Hobby Vercel Cron
 * cannot call it: that plan allows two jobs, each once per day, and those
 * slots are the trash purge and the reminders/archive maintenance job.
 */

import { msUntilNextMinute, startMinuteAlignedInterval } from "./cron-minute-align";

let started = false;
let stopAlignedCron: (() => void) | null = null;

export function startDevCron() {
  if (started) return;
  if (process.env.NODE_ENV === "production") return;
  if (process.env.DISABLE_DEV_CRON === "true") return;

  started = true;

  void import("./scheduled-messages").then(({ deliverDueScheduledMessages }) => {
    const tick = async () => {
      try {
        const result = await deliverDueScheduledMessages();
        if (result.sent > 0) {
          console.log(`[dev-cron] Scheduled messages delivered: ${result.sent}`);
        }
        if (result.failed > 0) {
          console.warn(`[dev-cron] Scheduled messages failed: ${result.failed}`);
        }
      } catch (error) {
        console.error("[dev-cron] Scheduled messages error:", error);
      }
    };

    stopAlignedCron = startMinuteAlignedInterval(tick);
    const waitSec = Math.ceil(msUntilNextMinute() / 1000);
    console.log(
      `[dev-cron] Scheduled messages at each minute boundary (next run in ${waitSec}s)`
    );
  });
}

export function stopDevCron() {
  stopAlignedCron?.();
  stopAlignedCron = null;
  started = false;
}
