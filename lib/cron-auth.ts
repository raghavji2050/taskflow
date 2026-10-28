import { timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when that env var is set.
 * Missing, empty, or mismatched secrets are rejected so the routes are not public.
 */
export function isCronAuthorized(
  authorization: string | null,
  secret: string | undefined
): boolean {
  if (!secret || !authorization) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorization);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
