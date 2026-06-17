export function isBlobUrl(url: string) {
  return url.startsWith("https://") && url.includes("blob.vercel-storage.com");
}

export function isPrivateBlobUrl(url: string) {
  return isBlobUrl(url) && url.includes(".private.blob.vercel-storage.com");
}

/** Browser-safe URL for img/a — proxies private blobs through our API. */
export function getAttachmentServeUrl(storedUrl: string) {
  if (isPrivateBlobUrl(storedUrl)) {
    return `/api/blob?url=${encodeURIComponent(storedUrl)}`;
  }
  return storedUrl;
}

function sanitizeDownloadFilename(filename: string) {
  return filename.replace(/[^\w.\-() ]/g, "_").slice(0, 200) || "download";
}

/** Forces browser save via Content-Disposition: attachment on the blob proxy. */
export function getAttachmentDownloadUrl(storedUrl: string, filename: string) {
  const base = getAttachmentServeUrl(storedUrl);
  if (!isPrivateBlobUrl(storedUrl)) {
    return base;
  }
  const params = new URLSearchParams({
    url: storedUrl,
    download: "1",
    filename: sanitizeDownloadFilename(filename),
  });
  return `/api/blob?${params.toString()}`;
}

export function blobAccessFromUrl(url: string): "public" | "private" {
  return isPrivateBlobUrl(url) ? "private" : "public";
}
