/** Pure rules for task file attachments (shared by API, browser and MCP). */
export const MAX_TASK_ATTACHMENT_BYTES = 25 * 1024 * 1024;
/** Vercel functions reject request bodies over ~4.5 MB, so bigger files go browser -> Blob directly. */
export const MAX_SERVER_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_MCP_UPLOAD_BYTES = 3 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_TASK = 50;
const BLOCKED_EXTENSIONS = new Set(["exe", "bat", "cmd", "com", "msi", "scr", "ps1", "vbs", "cpl", "jar", "apk", "dll"]);

export function cleanAttachmentFilename(name: string) {
  const base = name.split(/[\\/]/).pop()?.trim() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f]/g, "").slice(0, 200);
  return cleaned || "file";
}

export function validateTaskAttachment(p: { filename: string; size: number; existingCount: number; maxBytes?: number }): string | null {
  const max = p.maxBytes ?? MAX_TASK_ATTACHMENT_BYTES;
  if (p.existingCount >= MAX_ATTACHMENTS_PER_TASK) return `A task can have at most ${MAX_ATTACHMENTS_PER_TASK} files`;
  if (!Number.isFinite(p.size) || p.size <= 0) return "File is empty";
  if (p.size > max) return `${p.filename} is over the ${Math.round(max / (1024 * 1024))} MB limit`;
  const ext = p.filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext && BLOCKED_EXTENSIONS.has(ext)) return `.${ext} files can't be attached for safety`;
  return null;
}

/** Blob pathname must live under this task's folder so a token can't attach someone else's file. */
export function taskAttachmentPrefix(taskId: string) {
  return `tasks/${taskId}/`;
}

export function isPathForTask(pathname: string, taskId: string) {
  return pathname.startsWith(taskAttachmentPrefix(taskId)) && !pathname.includes("..");
}
