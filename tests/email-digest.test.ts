import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  task: { groupBy: vi.fn(), findMany: vi.fn() },
  user: { findMany: vi.fn() },
  notification: { groupBy: vi.fn() },
  $queryRaw: vi.fn(),
  taskDependency: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const sendEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email", async () => {
  const actual = await vi.importActual<typeof import("@/lib/email")>("@/lib/email");
  return { ...actual, sendEmail };
});

import { filterDigestRecipients, sendDailyDigests } from "@/lib/email-digest";

beforeEach(() => {
  vi.clearAllMocks();
  db.taskDependency.findMany.mockResolvedValue([]);
});

describe("filterDigestRecipients", () => {
  it("drops users who opted out of digests", () => {
    expect(
      filterDigestRecipients([
        { id: "a", emailDigestEnabled: true },
        { id: "b", emailDigestEnabled: false },
      ]).map((u) => u.id)
    ).toEqual(["a"]);
  });
});

describe("sendDailyDigests", () => {
  it("emails only users with emailDigestEnabled and uses real overdue counts", async () => {
    const now = new Date("2026-11-07T08:00:00Z");
    db.task.groupBy
      .mockResolvedValueOnce([
        { userId: "u1", _count: { _all: 4 } },
        { userId: "u2", _count: { _all: 2 } },
      ])
      .mockResolvedValueOnce([
        { userId: "u1", _count: { _all: 2 } },
      ]);
    db.user.findMany.mockResolvedValue([
      { id: "u1", name: "On", email: "on@example.com", emailDigestEnabled: true },
      // u2 opted out — should not appear in findMany (query filters), but if it did we still only send for returned users
    ]);
    db.$queryRaw.mockResolvedValue([{ userId: "u1", title: "Late invoice" }]);
    db.notification.groupBy.mockResolvedValue([{ userId: "u1", _count: { _all: 1 } }]);
    db.task.findMany.mockResolvedValue([
      { id: "t1", status: "PENDING", title: "Ready one", assignees: [{ userId: "u1" }] },
    ]);
    sendEmail.mockResolvedValue({ success: true, dev: true });

    await expect(sendDailyDigests(now)).resolves.toBe(1);

    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ emailDigestEnabled: true }),
      })
    );
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [, subject, html] = sendEmail.mock.calls[0];
    expect(subject).toBe("Your TaskFlow Daily Digest");
    expect(html).toContain("<strong>4</strong> pending");
    expect(html).toContain("<strong>2</strong> overdue");
    expect(html).toContain("Late invoice");
    expect(html).toContain("<strong>1</strong> unread @mention");
  });

  it("sends nothing when nobody has pending tasks", async () => {
    db.task.groupBy.mockResolvedValueOnce([]);
    await expect(sendDailyDigests()).resolves.toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
