export function isImageAttachment(mimeType: string) {
  return mimeType.startsWith("image/");
}

export function isPdfAttachment(mimeType: string, filename?: string) {
  if (mimeType === "application/pdf") return true;
  return filename?.toLowerCase().endsWith(".pdf") ?? false;
}

export type AttachmentKind =
  | "image"
  | "pdf"
  | "video"
  | "audio"
  | "word"
  | "spreadsheet"
  | "presentation"
  | "archive"
  | "text"
  | "code"
  | "other";

export function getFileExtension(filename: string) {
  const match = filename.match(/\.([^.]+)$/);
  return match ? match[1].toUpperCase() : "FILE";
}

export function getAttachmentKind(mimeType: string, filename = ""): AttachmentKind {
  const lower = filename.toLowerCase();
  if (isImageAttachment(mimeType)) return "image";
  if (isPdfAttachment(mimeType, filename)) return "pdf";
  if (mimeType.startsWith("video/") || /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(lower)) return "video";
  if (mimeType.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(lower)) return "audio";
  if (
    mimeType.includes("word") ||
    mimeType === "application/msword" ||
    /\.(doc|docx)$/i.test(lower)
  ) {
    return "word";
  }
  if (
    mimeType.includes("sheet") ||
    mimeType.includes("excel") ||
    /\.(xls|xlsx|csv)$/i.test(lower)
  ) {
    return "spreadsheet";
  }
  if (
    mimeType.includes("presentation") ||
    mimeType.includes("powerpoint") ||
    /\.(ppt|pptx)$/i.test(lower)
  ) {
    return "presentation";
  }
  if (
    mimeType.includes("zip") ||
    mimeType.includes("archive") ||
    mimeType.includes("compressed") ||
    /\.(zip|rar|7z|tar|gz)$/i.test(lower)
  ) {
    return "archive";
  }
  if (mimeType.startsWith("text/") || /\.(txt|md|json|xml|yaml|yml)$/i.test(lower)) {
    return "text";
  }
  if (
    /\.(js|ts|tsx|jsx|py|java|go|rs|cpp|c|h|css|html|sql)$/i.test(lower)
  ) {
    return "code";
  }
  return "other";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const MAX_DOCUMENT_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_CHAT_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_CHAT_ATTACHMENTS_PER_MESSAGE = 10;

export function attachmentPlaceholderBody(fileCount: number, filenames: string[]) {
  if (fileCount <= 0) return "";
  if (fileCount === 1 && filenames[0]) return `📎 ${filenames[0]}`;
  return `📎 ${fileCount} files`;
}

export function isMultiFileAttachmentBody(body: string) {
  return /^📎 \d+ files$/.test(body.trim());
}

export function parseChatUploadFiles(formData: FormData): File[] {
  const fromFiles = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (fromFiles.length > 0) return fromFiles;
  const single = formData.get("file");
  if (single instanceof File && single.size > 0) return [single];
  return [];
}

export function validateChatUploadFiles(files: File[]): string | null {
  if (files.length > MAX_CHAT_ATTACHMENTS_PER_MESSAGE) {
    return `Maximum ${MAX_CHAT_ATTACHMENTS_PER_MESSAGE} files per message`;
  }
  const tooLarge = files.find((f) => f.size > MAX_CHAT_ATTACHMENT_BYTES);
  if (tooLarge) {
    return `${tooLarge.name} exceeds ${formatFileSize(MAX_CHAT_ATTACHMENT_BYTES)} limit`;
  }
  return null;
}

export function isAttachmentOnlyBody(body: string, filename: string) {
  const trimmed = body.trim();
  return (
    trimmed === `📎 ${filename}` ||
    trimmed === filename ||
    isMultiFileAttachmentBody(trimmed)
  );
}

export function isGifAttachment(mimeType: string, filename = "") {
  return mimeType === "image/gif" || filename.toLowerCase().endsWith(".gif");
}

export function isGifStickerMessage(
  body: string,
  attachments?: { mimeType: string; filename: string }[]
) {
  if (!attachments || attachments.length !== 1) return false;
  const att = attachments[0]!;
  if (!isGifAttachment(att.mimeType, att.filename)) return false;
  const trimmed = body.trim();
  return !trimmed || isAttachmentOnlyBody(trimmed, att.filename);
}
