import { prisma } from "@/lib/prisma";

export type ConnectedApp = {
  clientId: string;
  name: string;
  connectedAt: string;
  lastActiveAt: string;
};

/**
 * OAuth clients (e.g. Claude connectors) that still hold a live access or
 * refresh token for this user. Codes and revoked/expired grants are ignored.
 */
export async function listConnectedApps(userId: string, now = new Date()): Promise<ConnectedApp[]> {
  const grants = await prisma.oAuthGrant.findMany({
    where: { userId, kind: { in: ["ACCESS", "REFRESH"] }, revokedAt: null, expiresAt: { gt: now } },
    select: { clientId: true, createdAt: true, client: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const byClient = new Map<string, ConnectedApp>();
  for (const g of grants) {
    const at = g.createdAt.toISOString();
    const existing = byClient.get(g.clientId);
    if (!existing) {
      byClient.set(g.clientId, { clientId: g.clientId, name: g.client.name, connectedAt: at, lastActiveAt: at });
    } else if (at > existing.lastActiveAt) {
      existing.lastActiveAt = at;
    }
  }
  return [...byClient.values()].sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
}

/** Disconnect one app: revoke every token/code it holds for this user. Returns grants revoked. */
export async function disconnectApp(userId: string, clientId: string): Promise<number> {
  const res = await prisma.oAuthGrant.updateMany({
    where: { userId, clientId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return res.count;
}

/** Revoke all OAuth grants for a user (used by sign-out-everywhere and password changes). */
export async function revokeAllOAuthGrants(userId: string): Promise<number> {
  const res = await prisma.oAuthGrant.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return res.count;
}
