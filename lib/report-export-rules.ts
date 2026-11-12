/** Pure helpers for report exports (CSV + PDF text safety). */
export const EXPORT_TYPES = ["tasks", "time"] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];
export const EXPORT_FORMATS = ["csv", "pdf"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export const MAX_EXPORT_ROWS = 5000;

export function csvCell(v: unknown) {
  const s = v === null || v === undefined ? "" : typeof v === "string" ? v : String(v);
  // Neutralise spreadsheet formulas (CSV injection).
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** UTF-8 BOM so Excel opens Hindi/emoji correctly. */
export function toCsv(head: string[], rows: unknown[][]) {
  return "\uFEFF" + [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Standard PDF fonts are WinAnsi only: keep Latin-1, swap smart punctuation, drop the rest. */
export function pdfSafe(s: string) {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?")
    .replace(/\?{2,}/g, "?");
}

/** Date in IST-agnostic YYYY-MM-DD using the caller's offset (minutes, as Date#getTimezoneOffset). */
export function localDate(d: Date | string | null | undefined, tzOffsetMinutes = 0) {
  if (!d) return "";
  const t = new Date(typeof d === "string" ? d : d.getTime());
  return new Date(t.getTime() - tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

export function hours(seconds: number) {
  return (Math.round((seconds / 3600) * 100) / 100).toFixed(2);
}

export function exportFilename(type: ExportType, scope: string, format: ExportFormat, now = new Date()) {
  const slug = scope.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "taskflow";
  return `taskflow-${type}-${slug}-${now.toISOString().slice(0, 10)}.${format}`;
}
