import { uploadAttachment } from "@/lib/blob-storage";

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9.-]/g, "_");
}

/** Server-only: persist a scheduled chat attachment before delivery. */
export async function saveScheduledAttachmentFile(userId: string, file: File) {
  const saved = await uploadAttachment({
    file,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    prefix: `chat/scheduled/${userId}`,
  });

  return {
    filename: file.name,
    url: saved.url,
    mimeType: file.type || "application/octet-stream",
    size: saved.size,
  };
}

export { sanitizeFilename };
