import { uploadAttachment } from "@/lib/blob-storage";

/** Server-only: persist a chat attachment to Blob (or local uploads in dev). */
export async function saveMessageAttachmentFile(userId: string, file: File) {
  const saved = await uploadAttachment({
    file,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    prefix: `chat/${userId}`,
  });

  return {
    filename: file.name,
    url: saved.url,
    mimeType: file.type || "application/octet-stream",
    size: saved.size,
  };
}
