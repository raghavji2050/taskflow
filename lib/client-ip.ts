/**
 * Client IP for rate limiting.
 *
 * On Vercel the edge overwrites x-forwarded-for / x-real-ip and sets
 * x-vercel-forwarded-for with the real client IP, so client-supplied values
 * never reach us (https://vercel.com/docs/headers/request-headers).
 * Off Vercel we only trust proxy-appended values: x-real-ip, else the
 * RIGHTMOST x-forwarded-for entry (the leftmost one is client-controlled).
 *
 * Tests may pin an IP with `x-test-client-ip`, but only when
 * TRUST_TEST_IP_HEADER=1 and we are not running on Vercel.
 */
type Env = Record<string, string | undefined>;
type HeaderSource = { headers: { get(name: string): string | null } };

export function testIpHeaderTrusted(env: Env = process.env): boolean {
  return env.TRUST_TEST_IP_HEADER === "1" && !env.VERCEL && !env.VERCEL_ENV;
}

function first(v: string | null): string | null {
  const s = v?.split(",")[0]?.trim();
  return s ? s : null;
}

function last(v: string | null): string | null {
  const parts = v?.split(",").map((p) => p.trim()).filter(Boolean) ?? [];
  return parts.length ? parts[parts.length - 1] : null;
}

export function getClientIp(request: HeaderSource, env: Env = process.env): string {
  const h = request.headers;
  if (testIpHeaderTrusted(env)) {
    const t = first(h.get("x-test-client-ip"));
    if (t) return t;
  }
  if (env.VERCEL) {
    return first(h.get("x-vercel-forwarded-for")) ?? first(h.get("x-real-ip")) ?? last(h.get("x-forwarded-for")) ?? "unknown";
  }
  return first(h.get("x-real-ip")) ?? last(h.get("x-forwarded-for")) ?? "unknown";
}
