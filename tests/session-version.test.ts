import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      update: vi.fn(async () => ({ sessionVersion: 3 })),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  SESSION_MAX_AGE_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
  isSessionRevoked,
  revokeAllSessions,
} from "@/lib/session-version";
import { authConfig } from "@/lib/auth.config";

describe("isSessionRevoked", () => {
  it("keeps a token valid while versions match", () => {
    expect(isSessionRevoked(0, 0)).toBe(false);
    expect(isSessionRevoked(4, 4)).toBe(false);
  });

  it("treats legacy tokens without a version as version 0", () => {
    expect(isSessionRevoked(undefined, 0)).toBe(false);
    expect(isSessionRevoked(null, 0)).toBe(false);
    expect(isSessionRevoked(undefined, 1)).toBe(true);
  });

  it("revokes a token once the user's version is bumped", () => {
    expect(isSessionRevoked(0, 1)).toBe(true);
    expect(isSessionRevoked(2, 5)).toBe(true);
  });

  it("does not trust malformed version claims", () => {
    expect(isSessionRevoked("1", 1)).toBe(true);
    expect(isSessionRevoked(1.5, 1)).toBe(true);
  });
});

describe("revokeAllSessions", () => {
  it("increments the user's sessionVersion", async () => {
    await expect(revokeAllSessions("u1")).resolves.toBe(3);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { sessionVersion: { increment: 1 } },
      select: { sessionVersion: true },
    });
  });
});

describe("session lifetime", () => {
  it("expires sessions after 14 days and refreshes daily", () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(14 * 24 * 60 * 60);
    expect(authConfig.session.maxAge).toBe(SESSION_MAX_AGE_SECONDS);
    expect(authConfig.session.updateAge).toBe(SESSION_UPDATE_AGE_SECONDS);
  });
});
