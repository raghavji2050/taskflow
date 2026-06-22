import { addDays, addMinutes, nextMonday } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { QuickSchedulePreset } from "@/lib/scheduled-message-types";

const MIN_LEAD_MS = 60_000;

export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function getDefaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

export function localDateTimeToUtc(date: string, time: string, timezone: string): Date {
  if (!isValidTimezone(timezone)) {
    throw new Error("Invalid timezone");
  }
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  const localIso = `${date}T${normalizedTime}`;
  return fromZonedTime(localIso, timezone);
}

export function assertScheduledInFuture(scheduledFor: Date, now = new Date()) {
  if (scheduledFor.getTime() - now.getTime() < MIN_LEAD_MS) {
    throw new Error("Scheduled time must be at least 1 minute in the future");
  }
}

export function formatScheduledForDisplay(scheduledFor: Date | string, timezone: string): string {
  const date = typeof scheduledFor === "string" ? new Date(scheduledFor) : scheduledFor;
  const tz = isValidTimezone(timezone) ? timezone : "UTC";
  return formatInTimeZone(date, tz, "EEE, MMM d, yyyy 'at' h:mm a");
}

export function getMillisUntilScheduled(
  scheduledFor: Date | string,
  now = new Date()
): number {
  const target =
    typeof scheduledFor === "string" ? new Date(scheduledFor) : scheduledFor;
  return target.getTime() - now.getTime();
}

/** Human-readable countdown, e.g. "2m 34s", "45s", "Sending…". */
export function formatCountdownUntil(
  scheduledFor: Date | string,
  now = new Date()
): string {
  const ms = getMillisUntilScheduled(scheduledFor, now);
  if (ms <= 0) return "Sending…";

  const totalSeconds = Math.ceil(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatScheduledForShort(scheduledFor: Date | string, timezone: string): string {
  const date = typeof scheduledFor === "string" ? new Date(scheduledFor) : scheduledFor;
  const tz = isValidTimezone(timezone) ? timezone : "UTC";
  const now = new Date();
  const todayKey = formatInTimeZone(now, tz, "yyyy-MM-dd");
  const targetKey = formatInTimeZone(date, tz, "yyyy-MM-dd");
  const tomorrowKey = formatInTimeZone(addDays(now, 1), tz, "yyyy-MM-dd");

  const timePart = formatInTimeZone(date, tz, "h:mm a");
  if (targetKey === todayKey) return `Today at ${timePart}`;
  if (targetKey === tomorrowKey) return `Tomorrow at ${timePart}`;
  return formatInTimeZone(date, tz, "MMM d 'at' h:mm a");
}

function atLocalTime(base: Date, timezone: string, hour: number, minute: number): Date {
  const dateKey = formatInTimeZone(base, timezone, "yyyy-MM-dd");
  return localDateTimeToUtc(
    dateKey,
    `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    timezone
  );
}

export function getQuickSchedulePresets(timezone: string, now = new Date()): QuickSchedulePreset[] {
  const tz = isValidTimezone(timezone) ? timezone : "UTC";
  const tomorrow = addDays(now, 1);
  const mondayBase = nextMonday(now);
  const monday =
    mondayBase.getTime() <= now.getTime() ? addDays(mondayBase, 7) : mondayBase;

  const presets: QuickSchedulePreset[] = [
    { id: "30m", label: "In 30 minutes", scheduledFor: addMinutes(now, 30) },
    { id: "1h", label: "In 1 hour", scheduledFor: addMinutes(now, 60) },
    {
      id: "tomorrow-9",
      label: "Tomorrow 9:00 AM",
      scheduledFor: atLocalTime(tomorrow, tz, 9, 0),
    },
    {
      id: "tomorrow-2pm",
      label: "Tomorrow 2:00 PM",
      scheduledFor: atLocalTime(tomorrow, tz, 14, 0),
    },
    {
      id: "monday-9",
      label: "Next Monday 9:00 AM",
      scheduledFor: atLocalTime(monday, tz, 9, 0),
    },
  ];

  return presets.filter((p) => p.scheduledFor.getTime() - now.getTime() >= MIN_LEAD_MS);
}

export const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
] as const;
