/**
 * Sign-out marker (edge-safe, no Node imports).
 *
 * Auth.js re-signs the JWT session cookie on every session read, including in middleware.
 * If a request that started before sign-out finishes after it, its Set-Cookie brings the
 * just-cleared session back, and the user stays signed in ("Sign out" lands on /dashboard).
 *
 * Fix: every sign-in gets its own `sid` claim. Signing out stores that sid in an httpOnly
 * marker cookie that no in-flight response rewrites. Middleware treats a session whose sid
 * matches the marker as signed out and deletes the resurrected cookie. A new sign-in gets
 * a new sid, so it is unaffected.
 */
export const SIGNED_OUT_COOKIE = "tf_signed_out_sid";

/** Same lifetime as the session itself (keep in sync with lib/auth.config.ts). */
export const SIGNED_OUT_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

const SESSION_COOKIE_RE = /^(__Secure-)?(authjs|next-auth)\.session-token(\.\d+)?$/;

export function isSessionCookieName(name: string): boolean {
  return SESSION_COOKIE_RE.test(name);
}

export function newSessionId(): string {
  return globalThis.crypto.randomUUID();
}

/** True when this session was explicitly signed out in this browser. */
export function isSignedOutSession(sid: string | null | undefined, marker: string | null | undefined): boolean {
  return Boolean(sid && marker && sid === marker);
}

/** Drops Set-Cookie headers that would (re)write the session cookie. */
export function stripSessionSetCookies(headers: Headers): void {
  const kept = headers.getSetCookie().filter((c) => {
    const name = c.split("=", 1)[0]?.trim() ?? "";
    return !isSessionCookieName(name);
  });
  headers.delete("set-cookie");
  for (const c of kept) headers.append("set-cookie", c);
}
