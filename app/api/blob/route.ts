import { get } from "@vercel/blob";
import { getAuthenticatedUser } from "@/lib/api";
import { canUserAccessBlobUrl } from "@/lib/blob-access";
import { blobAccessFromUrl, isBlobUrl } from "@/lib/blob-url";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const url = searchParams.get("url")?.trim();
  if (!url || !isBlobUrl(url)) {
    return new Response("Bad request", { status: 400 });
  }

  const forceDownload = searchParams.get("download") === "1";
  const downloadFilename = searchParams.get("filename")?.trim();

  if (!(await canUserAccessBlobUrl(user.id, url))) {
    return new Response("Forbidden", { status: 403 });
  }

  const result = await get(url, { access: blobAccessFromUrl(url) });
  if (!result || result.statusCode === 304 || !result.stream) {
    return new Response(null, { status: result?.statusCode ?? 404 });
  }

  const headers: Record<string, string> = {
    "Cache-Control": "private, max-age=3600",
  };
  if (forceDownload && downloadFilename) {
    const safe = downloadFilename.replace(/[^\w.\-() ]/g, "_").slice(0, 200) || "download";
    headers["Content-Disposition"] = `attachment; filename="${safe}"`;
  } else {
    headers["Content-Disposition"] = result.blob.contentDisposition;
  }
  if (result.blob.contentType) {
    headers["Content-Type"] = result.blob.contentType;
  }

  return new Response(result.stream, { headers });
}
