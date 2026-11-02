import { prisma } from "@/lib/prisma";

/** Max session lifetime (seconds). Tokens older than this need a fresh sign-in. */
export const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;
/** How often an active session's JWT is re-issued (seconds). */
export const SESSION_UPDATE_AGE_SECONDS = 24 * 60 * 60;

/**
 * A token is revoked when the version it was issued with no longer matches the
 * user's current sessionVersion. Tokens issued before this feature carry no
 * version and count as 0, so existing users stay signed in until a bump.
 */
export function isSessionRevoked(tokenVersion: unknown, currentVersion: number): boolean {
  const issued = typeof tokenVersion === "number" && Number.isInteger(tokenVersion) ? tokenVersion : 0;
  return issued !== currentVersion;
}

/** Revoke every session for a user (all devices, including the current one). */
export async function revokeAllSessions(userId: string): Promise<number> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  return user.sessionVersion;
}
