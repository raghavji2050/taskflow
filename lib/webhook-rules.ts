import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/** Pure webhook helpers: events, URL safety, signatures. */
import { WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/webhook-events";
export { WEBHOOK_EVENTS, type WebhookEvent };
export const MAX_WEBHOOKS_PER_WORKSPACE = 10;
export const DISABLE_AFTER_FAILURES = 10;

export function parseEvents(raw: unknown): WebhookEvent[] | null {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : null;
  if (!list) return null;
  const set = new Set(list.map((e) => String(e).trim()).filter((e) => (WEBHOOK_EVENTS as readonly string[]).includes(e)));
  return set.size ? ([...set] as WebhookEvent[]) : null;
}

export function generateWebhookSecret() {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

/** Signature header value: `t=<unix>,v1=<hex hmac-sha256 of "t.body">` (Stripe-style, replay-safe). */
export function signPayload(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

export function verifySignature(secret: string, body: string, header: string, toleranceSec = 300, now = Math.floor(Date.now() / 1000)) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(t) || Math.abs(now - t) > toleranceSec) return false;
  const expected = Buffer.from(signPayload(secret, body, t).split("v1=")[1], "hex");
  const got = Buffer.from(parts.v1, "hex");
  return expected.length === got.length && timingSafeEqual(expected, got);
}

const PRIVATE_V4 = [/^10\./, /^127\./, /^0\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^22[4-9]\./, /^2[3-5]\d\./];
export function isPrivateIp(ip: string) {
  const v = ip.toLowerCase().replace(/^::ffff:/, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v)) return PRIVATE_V4.some((r) => r.test(v));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("ff");
}

/** Static URL check. `allowPrivate` is only for tests / local dev. */
export function checkWebhookUrl(raw: string, allowPrivate = false): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "Enter a valid URL" };
  }
  if (url.username || url.password) return { ok: false, error: "URLs with credentials are not allowed" };
  if (allowPrivate) return url.protocol === "https:" || url.protocol === "http:" ? { ok: true, url } : { ok: false, error: "Use an http(s) URL" };
  if (url.protocol !== "https:") return { ok: false, error: "Webhook URLs must use https" };
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".") && !host.includes(":")) {
    return { ok: false, error: "Private or local addresses are not allowed" };
  }
  if ((/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) && isPrivateIp(host)) return { ok: false, error: "Private or local addresses are not allowed" };
  return { ok: true, url };
}

export function secretHint(secret: string) {
  return `${secret.slice(0, 10)}…${secret.slice(-4)}`;
}
