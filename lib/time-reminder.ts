import type { TimeTrackingPrefs } from "@/lib/time-tracking-prefs";

export function getEntryElapsedSeconds(entry: {
  duration: number;
  startTime: Date;
  isRunning: boolean;
  isPaused: boolean;
}, now: Date = new Date()): number {
  if (!entry.isRunning) return entry.duration;
  if (entry.isPaused) return entry.duration;
  const segment = Math.max(
    0,
    Math.floor((now.getTime() - entry.startTime.getTime()) / 1000)
  );
  return entry.duration + segment;
}

export function shouldSendRunningReminder(params: {
  entry: {
    startTime: Date;
    duration: number;
    isRunning: boolean;
    isPaused: boolean;
    lastReminderAt: Date | null;
    reminderSnoozedUntil: Date | null;
  };
  prefs: TimeTrackingPrefs;
  now?: Date;
}): boolean {
  const now = params.now ?? new Date();
  const { entry, prefs } = params;

  if (!entry.isRunning || entry.isPaused) return false;
  if (prefs.runningReminderHours === 0 && !prefs.runningReminderEndOfDay) return false;

  if (entry.reminderSnoozedUntil && entry.reminderSnoozedUntil > now) {
    return false;
  }

  const elapsedSeconds = getEntryElapsedSeconds(entry, now);
  const elapsedHours = elapsedSeconds / 3600;

  const hourThresholdMet =
    prefs.runningReminderHours > 0 && elapsedHours >= prefs.runningReminderHours;

  let endOfDayMet = false;
  if (prefs.runningReminderEndOfDay) {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: prefs.timezone,
        hour: "numeric",
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const parts = formatter.formatToParts(now);
      const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
      const todayKey = `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}-${parts.find((p) => p.type === "day")?.value}`;
      const startParts = formatter.formatToParts(entry.startTime);
      const startKey = `${startParts.find((p) => p.type === "year")?.value}-${startParts.find((p) => p.type === "month")?.value}-${startParts.find((p) => p.type === "day")?.value}`;
      endOfDayMet = todayKey === startKey && hour >= prefs.endOfDayHour;
    } catch {
      endOfDayMet = false;
    }
  }

  if (!hourThresholdMet && !endOfDayMet) return false;

  if (entry.lastReminderAt) {
    const hoursSinceLast = (now.getTime() - entry.lastReminderAt.getTime()) / 3600000;
    if (hoursSinceLast < 1) return false;
  }

  return true;
}

export function computeReminderSnoozeUntil(
  prefs: TimeTrackingPrefs,
  now: Date = new Date()
): Date {
  if (prefs.runningReminderHours > 0) {
    return new Date(now.getTime() + prefs.runningReminderHours * 3600000);
  }
  const snooze = new Date(now);
  snooze.setHours(23, 59, 59, 999);
  return snooze;
}

export function validateSplitSegments(
  totalDuration: number,
  segments: { durationSeconds: number }[]
): string | null {
  if (segments.length < 2) return "At least two segments required";
  const minSegment = 60;
  for (const seg of segments) {
    if (seg.durationSeconds < minSegment) {
      return `Each segment must be at least ${minSegment} seconds`;
    }
  }
  const sum = segments.reduce((acc, s) => acc + s.durationSeconds, 0);
  if (sum !== totalDuration) {
    return "Segment durations must sum to the original entry duration";
  }
  return null;
}
