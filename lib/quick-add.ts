/**
 * Hinglish / English natural-language quick-add parser.
 * "kal 5 baje client call !high" -> { title: "client call", date: tomorrow, time: 17:00, priority: HIGH }
 * Dates/times are wall-clock values in the given IANA timezone (default Asia/Calcutta).
 */
export type QuickAddPriority = "LOW" | "MEDIUM" | "HIGH";

export interface QuickAddResult {
  title: string;
  /** YYYY-MM-DD in the target timezone, or null */
  date: string | null;
  /** HH:MM (24h), or null */
  time: string | null;
  priority: QuickAddPriority | null;
  /** True when anything besides the title was detected */
  matched: boolean;
}

export const DEFAULT_QUICK_ADD_TZ = "Asia/Calcutta";

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, ravivar: 0, itwar: 0, raviwar: 0,
  monday: 1, mon: 1, somvar: 1, somwar: 1,
  tuesday: 2, tue: 2, tues: 2, mangalvar: 2, mangalwar: 2,
  wednesday: 3, wed: 3, budhvar: 3, budhwar: 3,
  thursday: 4, thu: 4, thurs: 4, guruvar: 4, guruwar: 4, brihaspativar: 4,
  friday: 5, fri: 5, shukravar: 5, shukrawar: 5,
  saturday: 6, sat: 6, shanivar: 6, shaniwar: 6,
};

const DAY_OFFSETS: Record<string, number> = {
  aaj: 0, aj: 0, today: 0,
  kal: 1, tomorrow: 1, tmrw: 1, tmr: 1,
  parso: 2, parson: 2,
};

type Period = "am" | "pm" | "subah" | "dopahar" | "shaam" | "raat" | null;
const PERIOD_WORDS: Record<string, Exclude<Period, null>> = {
  subah: "subah", subha: "subah", savere: "subah", morning: "subah",
  dopahar: "dopahar", dopehar: "dopahar", afternoon: "dopahar",
  shaam: "shaam", sham: "shaam", evening: "shaam",
  raat: "raat", rat: "raat", night: "raat",
};

function todayParts(now: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day), wd };
}

function addDays(y: number, m: number, d: number, n: number) {
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function to24(h: number, period: Period): number {
  if (period === "am" || period === "subah") return h === 12 ? 0 : h;
  if (period === "pm" || period === "shaam" || period === "raat") {
    if (period === "raat" && h === 12) return 0;
    return h < 12 ? h + 12 : h;
  }
  if (period === "dopahar") return h < 6 ? h + 12 : h; // 12-5 => 12-17
  // No period: "5 baje" -> assume working hours (1-7 => PM, 8-11 => AM)
  if (h >= 1 && h <= 7) return h + 12;
  return h;
}

export function parseQuickAdd(
  input: string,
  opts: { now?: Date; timeZone?: string } = {}
): QuickAddResult {
  const now = opts.now ?? new Date();
  let timeZone = opts.timeZone || DEFAULT_QUICK_ADD_TZ;
  try { new Intl.DateTimeFormat("en", { timeZone }); } catch { timeZone = DEFAULT_QUICK_ADD_TZ; }

  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const keep: boolean[] = tokens.map(() => true);
  let priority: QuickAddPriority | null = null;
  let dayOffset: number | null = null;
  let weekday: number | null = null;
  let period: Period = null;
  let hour: number | null = null;
  let minute = 0;

  const low = tokens.map((t) => t.toLowerCase().replace(/[,.]$/, ""));

  for (let i = 0; i < low.length; i++) {
    const t = low[i];
    if (/^!(high|h|urgent|p1)$/.test(t)) { priority = "HIGH"; keep[i] = false; continue; }
    if (/^!(low|l|p3)$/.test(t)) { priority = "LOW"; keep[i] = false; continue; }
    if (/^!(medium|med|m|p2)$/.test(t)) { priority = "MEDIUM"; keep[i] = false; continue; }
    if (dayOffset === null && weekday === null && t in DAY_OFFSETS) {
      dayOffset = DAY_OFFSETS[t]; keep[i] = false; continue;
    }
    if (dayOffset === null && weekday === null && t in WEEKDAYS) {
      // Only treat short English abbreviations as weekdays when not mid-sentence ambiguity: accept all.
      weekday = WEEKDAYS[t]; keep[i] = false;
      if (low[i + 1] === "ko") keep[i + 1] = false;
      continue;
    }
    if (period === null && t in PERIOD_WORDS) {
      // Only consume if a time number is adjacent (e.g. "shaam 6") or "ko"
      const next = low[i + 1] ?? "";
      if (/^\d{1,2}([:.]\d{2})?(am|pm)?$/.test(next) || next === "ko") {
        period = PERIOD_WORDS[t]; keep[i] = false;
        if (next === "ko") keep[i + 1] = false;
        continue;
      }
    }
    if (hour === null) {
      let m = t.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)$/);
      if (m) {
        hour = Number(m[1]); minute = Number(m[2] ?? 0); period = m[3] as Period; keep[i] = false;
        continue;
      }
      m = t.match(/^(\d{1,2})(?:[:.](\d{2}))?$/);
      if (m) {
        const next = low[i + 1];
        const prevIsPeriod = i > 0 && !keep[i - 1] && low[i - 1] in PERIOD_WORDS;
        const isBaje = next === "baje" || next === "bje" || next === "bajey";
        const isAmPm = next === "am" || next === "pm";
        const hasColon = m[2] !== undefined;
        if (isBaje || isAmPm || prevIsPeriod || hasColon) {
          hour = Number(m[1]); minute = Number(m[2] ?? 0); keep[i] = false;
          if (isBaje || isAmPm) {
            keep[i + 1] = false;
            if (isAmPm) period = next as Period;
          }
          continue;
        }
      }
    }
  }

  if (hour !== null && (hour > 23 || minute > 59)) { hour = null; minute = 0; }
  const time = hour !== null
    ? `${String(to24(hour, period)).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
    : null;

  const { y, m, d, wd } = todayParts(now, timeZone);
  let date: string | null = null;
  if (dayOffset !== null) date = addDays(y, m, d, dayOffset);
  else if (weekday !== null) {
    let diff = (weekday - wd + 7) % 7;
    if (diff === 0) diff = 7; // "monday" on a Monday means next Monday
    date = addDays(y, m, d, diff);
  } else if (time) date = addDays(y, m, d, 0);

  const title = tokens.filter((_, i) => keep[i]).join(" ").replace(/\s+/g, " ").trim();
  const matched = date !== null || time !== null || priority !== null;
  return { title: title || input.trim(), date, time, priority, matched };
}

/** Human preview like "Kal (Mon, 2 Nov) · 5:00 PM · High" */
export function formatQuickAddPreview(r: QuickAddResult, opts: { now?: Date; timeZone?: string } = {}): string {
  const parts: string[] = [];
  if (r.date) {
    const tz = opts.timeZone || DEFAULT_QUICK_ADD_TZ;
    const { y, m, d } = todayParts(opts.now ?? new Date(), tz);
    const label = r.date === addDays(y, m, d, 0) ? "Aaj" : r.date === addDays(y, m, d, 1) ? "Kal" : r.date === addDays(y, m, d, 2) ? "Parso" : null;
    const [yy, mm, dd] = r.date.split("-").map(Number);
    const pretty = new Date(Date.UTC(yy, mm - 1, dd)).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
    parts.push(label ? `${label} (${pretty})` : pretty);
  }
  if (r.time) {
    const [h, mi] = r.time.split(":").map(Number);
    parts.push(`${h % 12 === 0 ? 12 : h % 12}:${String(mi).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`);
  }
  if (r.priority) parts.push(r.priority[0] + r.priority.slice(1).toLowerCase() + " priority");
  return parts.join(" · ");
}
