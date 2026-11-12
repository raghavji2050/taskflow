import { createHash } from "crypto";

/** Weak ETag for a JSON body (same body -> same tag). */
export function weakEtag(body: string) {
  return `W/"${createHash("sha1").update(body).digest("base64url")}"`;
}

/** RFC 9110 weak comparison against an If-None-Match header. */
export function etagMatches(ifNoneMatch: string | null, etag: string) {
  if (!ifNoneMatch) return false;
  const bare = etag.replace(/^W\//, "");
  return ifNoneMatch.split(",").some((t) => {
    const v = t.trim();
    return v === "*" || v.replace(/^W\//, "") === bare;
  });
}

/** Clamp ?limit= style values. */
export function clampLimit(raw: string | null, fallback: number, max: number) {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n < 1) return fallback;
  return Math.min(max, Math.floor(n));
}
