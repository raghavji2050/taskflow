export const REQUEST_ID_HEADER = "x-request-id";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/** Reuse an inbound id only when it is short and safe to echo into logs and headers. */
export function getOrCreateRequestId(headers: Headers): string {
  const candidates = [headers.get(REQUEST_ID_HEADER), headers.get("x-vercel-id")];
  for (const value of candidates) {
    if (value && SAFE_REQUEST_ID.test(value)) return value;
  }
  return crypto.randomUUID();
}
