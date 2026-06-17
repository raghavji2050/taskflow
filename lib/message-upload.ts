import { writeFile, mkdir } from "fs/promises";
import path from "path";

/** Server-only: persist a chat attachment under public/uploads. */
export async function saveMessageAttachmentFile(userId: string, file: File) {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const uploadDir = path.join(process.cwd(), "public", "uploads", userId);
  await mkdir(uploadDir, { recursive: true });

  const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const filepath = path.join(uploadDir, filename);
  await writeFile(filepath, buffer);

  return {
    filename: file.name,
    url: `/uploads/${userId}/${filename}`,
    mimeType: file.type || "application/octet-stream",
    size: buffer.length,
  };
}
