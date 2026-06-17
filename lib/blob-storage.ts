import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { del, put } from "@vercel/blob";
import { isBlobUrl } from "@/lib/blob-url";

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9.-]/g, "_");
}

export function isBlobStorageConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function isManagedBlobUrl(url: string) {
  return isBlobUrl(url);
}

async function uploadToLocal(params: {
  file: Buffer;
  filename: string;
  mimeType: string;
  prefix: string;
}) {
  const safeName = `${Date.now()}-${sanitizeFilename(params.filename)}`;
  const urlPath = `/uploads/${params.prefix}/${safeName}`;
  const filepath = path.join(process.cwd(), "public", "uploads", params.prefix, safeName);
  await mkdir(path.dirname(filepath), { recursive: true });
  await writeFile(filepath, params.file);

  return {
    url: urlPath,
    size: params.file.length,
    storedName: safeName,
  };
}

export async function uploadAttachment(params: {
  file: File | Buffer;
  filename: string;
  mimeType: string;
  prefix: string;
}) {
  const buffer = Buffer.isBuffer(params.file)
    ? params.file
    : Buffer.from(await params.file.arrayBuffer());
  const safeName = `${Date.now()}-${sanitizeFilename(params.filename)}`;
  const pathname = `${params.prefix}/${safeName}`;

  if (!isBlobStorageConfigured()) {
    return uploadToLocal({ ...params, file: buffer });
  }

  const blob = await put(pathname, buffer, {
    access: "private",
    contentType: params.mimeType || "application/octet-stream",
  });

  return {
    url: blob.url,
    size: buffer.length,
    storedName: safeName,
  };
}

export async function deleteAttachmentUrl(url: string) {
  if (isManagedBlobUrl(url)) {
    await del(url).catch(() => undefined);
    return;
  }

  if (url.startsWith("/uploads/")) {
    const filepath = path.join(process.cwd(), "public", url);
    await unlink(filepath).catch(() => undefined);
  }
}
