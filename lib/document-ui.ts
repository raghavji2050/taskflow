import type { DocumentType } from "@prisma/client";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  DOC: "Documentation",
  SOP: "SOP",
  MEETING_NOTES: "Meeting notes",
  NOTE: "Note",
};

export const DOCUMENT_TYPE_ICONS: Record<DocumentType, string> = {
  DOC: "📄",
  SOP: "📋",
  MEETING_NOTES: "📝",
  NOTE: "📌",
};

export function formatDocDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function defaultDocumentShareBody(title: string, icon?: string | null) {
  const emoji = icon?.trim() || "📄";
  return `Shared ${emoji} ${title}`;
}

export function isDocumentShareBody(body: string) {
  return body.trim().startsWith("Shared ");
}

export function isDefaultDocumentShareBody(
  body: string,
  title: string,
  icon?: string | null
) {
  return body.trim() === defaultDocumentShareBody(title, icon);
}

export function defaultMomShareBody(title: string) {
  return `📝 MoM: ${title}`;
}

export function isMomShareBody(body: string) {
  return body.trim().startsWith("📝 MoM:");
}

export function formatMomDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatMomTimeRange(startedAt: string, endedAt: string | null) {
  if (!endedAt) return formatMomDateTime(startedAt);
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (sameDay) {
    const date = start.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const startTime = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const endTime = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${date}, ${startTime} – ${endTime}`;
  }
  return `${formatMomDateTime(startedAt)} – ${formatMomDateTime(endedAt)}`;
}

export function parseMomDateValue(iso: string) {
  const trimmed = iso.trim();
  if (!trimmed) return null;
  const d = trimmed.includes("T") ? new Date(trimmed) : new Date(`${trimmed.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatMomDueDate(iso: string) {
  const d = parseMomDateValue(iso);
  if (!d) return iso.trim() || "—";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
