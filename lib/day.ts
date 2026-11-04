/**
 * One definition of "which calendar day is this due date on" for the whole app
 * (list labels, overdue, calendar grid + agenda, MCP plan_my_day).
 *
 * - Plain dates ("2026-11-10") and midnight-UTC datetimes (how date-only due dates
 *   are stored) are calendar days, not instants: they keep their Y-M-D.
 * - Any other datetime is an instant and lands on the user's local day.
 */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00(?::00(?:\.000)?)?(?:Z|\+00:00))?$/;

export type DayParts = { y: number; m: number; d: number };

/** tzOffsetMinutes: minutes east of UTC (IST = 330). Omit to use the runtime's local zone. */
export function dueDayParts(value: string | Date | null | undefined, tzOffsetMinutes?: number): DayParts | null {
  if (!value) return null;
  const iso = typeof value === "string" ? value : Number.isNaN(value.getTime()) ? "" : value.toISOString();
  const m = iso.match(DATE_ONLY);
  if (m) return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
  const t = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(t.getTime())) return null;
  if (tzOffsetMinutes === undefined) return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() };
  const s = new Date(t.getTime() + tzOffsetMinutes * 60_000);
  return { y: s.getUTCFullYear(), m: s.getUTCMonth(), d: s.getUTCDate() };
}

export function dayKey(p: DayParts) {
  return p.y * 10000 + p.m * 100 + p.d;
}

export function isDateOnlyDue(value: string | Date): boolean {
  const iso = typeof value === "string" ? value : Number.isNaN(value.getTime()) ? "" : value.toISOString();
  return DATE_ONLY.test(iso);
}
