export function computeElapsedSeconds(startTime: Date, endTime?: Date | null): number {
  const end = endTime ?? new Date();
  return Math.max(0, Math.floor((end.getTime() - startTime.getTime()) / 1000));
}

export function formatDurationHms(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export function formatDurationShort(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

export function parseDurationInput(hours: number, minutes: number): number {
  const h = Math.max(0, Math.floor(hours));
  const m = Math.max(0, Math.min(59, Math.floor(minutes)));
  return h * 3600 + m * 60;
}

export function parseDurationText(text: string): number | null {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return null;

  const hms = trimmed.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (hms) {
    const h = Number(hms[1]);
    const m = Number(hms[2]);
    const s = hms[3] ? Number(hms[3]) : 0;
    if (m >= 60 || s >= 60) return null;
    return h * 3600 + m * 60 + s;
  }

  let total = 0;
  const hourMatch = trimmed.match(/(\d+)\s*h/);
  const minMatch = trimmed.match(/(\d+)\s*m/);
  const secMatch = trimmed.match(/(\d+)\s*s/);
  if (hourMatch) total += Number(hourMatch[1]) * 3600;
  if (minMatch) total += Number(minMatch[1]) * 60;
  if (secMatch) total += Number(secMatch[1]);
  if (total > 0) return total;

  const plain = Number(trimmed);
  return Number.isFinite(plain) && plain > 0 ? Math.floor(plain) : null;
}

export type TimeRangePreset = "today" | "week" | "month" | "custom" | "all";

export function resolveTimeRange(
  preset: TimeRangePreset,
  from?: string | null,
  to?: string | null
): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (preset === "all") return { from: null, to: null };
  if (preset === "custom") {
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    return {
      from: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : null,
      to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : null,
    };
  }

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (preset === "today") {
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { from: start, to: end };
  }

  if (preset === "week") {
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { from: start, to: end };
  }

  if (preset === "month") {
    start.setDate(1);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { from: start, to: end };
  }

  return { from: null, to: null };
}
