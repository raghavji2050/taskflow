import { NextResponse } from "next/server";
import { etagMatches, weakEtag } from "@/lib/http-cache-rules";

/**
 * JSON response with a weak ETag. Per-user data, so `private, no-cache`:
 * browsers revalidate every time and get a body-less 304 when nothing changed.
 */
export function cachedJson(request: Request, data: unknown, opts: { startedAt?: number } = {}) {
  const body = JSON.stringify(data);
  const etag = weakEtag(body);
  const headers = new Headers({ ETag: etag, "Cache-Control": "private, no-cache", Vary: "Cookie, Authorization" });
  if (opts.startedAt !== undefined) headers.set("Server-Timing", `app;dur=${Math.round(performance.now() - opts.startedAt)}`);
  if (etagMatches(request.headers.get("if-none-match"), etag)) return new NextResponse(null, { status: 304, headers });
  headers.set("Content-Type", "application/json");
  return new NextResponse(body, { status: 200, headers });
}
