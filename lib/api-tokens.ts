import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

export const API_TOKEN_PREFIX = "tf_";
export const MAX_ACTIVE_TOKENS = 20;

export function generateApiToken() {
  const token = API_TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, tokenHash: hashApiToken(token), prefix: token.slice(0, 10) };
}

export function hashApiToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Extracts a well-formed taskflow token from an Authorization header. */
export function parseBearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1];
  if (!token.startsWith(API_TOKEN_PREFIX) || token.length < 20 || token.length > 200) return null;
  return token;
}

export async function authenticateApiToken(header: string | null | undefined) {
  const token = parseBearerToken(header);
  if (!token) return null;
  const record = await prisma.apiToken.findUnique({
    where: { tokenHash: hashApiToken(token) },
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
  });
  if (!record || record.revokedAt) return null;
  // Throttle lastUsedAt writes to once a minute.
  if (!record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() > 60_000) {
    await prisma.apiToken
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  }
  return { tokenId: record.id, user: record.user };
}
