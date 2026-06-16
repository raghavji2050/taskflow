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
