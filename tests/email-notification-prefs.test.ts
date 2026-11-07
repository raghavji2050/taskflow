import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import {
  defaultEmailNotificationPrefs,
  getEmailNotificationPrefs,
  updateEmailNotificationPrefs,
  emailNotificationPrefsUpdateSchema,
} from "@/lib/email-notification-prefs";

beforeEach(() => vi.clearAllMocks());

describe("email notification prefs", () => {
  it("defaults both toggles on", () => {
    expect(defaultEmailNotificationPrefs()).toEqual({
      emailDigestEnabled: true,
      emailMentionEnabled: true,
    });
  });

  it("getEmailNotificationPrefs reads User columns", async () => {
    db.user.findUnique.mockResolvedValue({
      emailDigestEnabled: false,
      emailMentionEnabled: true,
    });
    await expect(getEmailNotificationPrefs("u1")).resolves.toEqual({
      emailDigestEnabled: false,
      emailMentionEnabled: true,
    });
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { emailDigestEnabled: true, emailMentionEnabled: true },
    });
  });

  it("updateEmailNotificationPrefs patches only provided fields", async () => {
    db.user.update.mockResolvedValue({
      emailDigestEnabled: false,
      emailMentionEnabled: true,
    });
    await expect(
      updateEmailNotificationPrefs("u1", { emailDigestEnabled: false })
    ).resolves.toEqual({ emailDigestEnabled: false, emailMentionEnabled: true });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { emailDigestEnabled: false },
      select: { emailDigestEnabled: true, emailMentionEnabled: true },
    });
  });

  it("update schema rejects unknown keys via strip/partial", () => {
    const parsed = emailNotificationPrefsUpdateSchema.parse({
      emailDigestEnabled: false,
      nonsense: true,
    });
    expect(parsed).toEqual({ emailDigestEnabled: false });
  });
});
