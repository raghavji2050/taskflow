import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  oAuthGrant: { findMany: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { disconnectApp, listConnectedApps, revokeAllOAuthGrants } from "@/lib/mcp/connected-apps";

const d = (s: string) => new Date(s);

beforeEach(() => vi.clearAllMocks());

describe("listConnectedApps", () => {
  it("only queries live access/refresh grants for the user", async () => {
    db.oAuthGrant.findMany.mockResolvedValue([]);
    const now = d("2026-11-03T00:00:00Z");
    await expect(listConnectedApps("u1", now)).resolves.toEqual([]);
    expect(db.oAuthGrant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1", kind: { in: ["ACCESS", "REFRESH"] }, revokedAt: null, expiresAt: { gt: now } },
      })
    );
  });

  it("groups grants per client with first and latest token times, newest first", async () => {
    db.oAuthGrant.findMany.mockResolvedValue([
      { clientId: "c1", createdAt: d("2026-11-01T10:00:00Z"), client: { name: "Claude" } },
      { clientId: "c2", createdAt: d("2026-11-01T11:00:00Z"), client: { name: "Cursor" } },
      { clientId: "c1", createdAt: d("2026-11-02T09:00:00Z"), client: { name: "Claude" } },
    ]);
    const apps = await listConnectedApps("u1");
    expect(apps).toEqual([
      { clientId: "c1", name: "Claude", connectedAt: "2026-11-01T10:00:00.000Z", lastActiveAt: "2026-11-02T09:00:00.000Z" },
      { clientId: "c2", name: "Cursor", connectedAt: "2026-11-01T11:00:00.000Z", lastActiveAt: "2026-11-01T11:00:00.000Z" },
    ]);
  });
});

describe("revocation", () => {
  it("disconnectApp revokes only that user's grants for the client", async () => {
    db.oAuthGrant.updateMany.mockResolvedValue({ count: 2 });
    await expect(disconnectApp("u1", "c1")).resolves.toBe(2);
    expect(db.oAuthGrant.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", clientId: "c1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("revokeAllOAuthGrants revokes every live grant of the user", async () => {
    db.oAuthGrant.updateMany.mockResolvedValue({ count: 5 });
    await expect(revokeAllOAuthGrants("u1")).resolves.toBe(5);
    expect(db.oAuthGrant.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
