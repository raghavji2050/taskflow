export function isImageAttachment(mimeType: string) {
  return mimeType.startsWith("image/");
}

export function isPdfAttachment(mimeType: string, filename?: string) {
  if (mimeType === "application/pdf") return true;
  return filename?.toLowerCase().endsWith(".pdf") ?? false;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const MAX_DOCUMENT_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export function isAttachmentOnlyBody(body: string, filename: string) {
  const trimmed = body.trim();
  return trimmed === `📎 ${filename}` || trimmed === filename;
}
