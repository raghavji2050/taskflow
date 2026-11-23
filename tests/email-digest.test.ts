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

  it("adds 'your top 3 today' and a stale count", async () => {
    const now = new Date("2026-11-23T08:00:00Z");
    const day = 24 * 60 * 60 * 1000;
    db.task.groupBy
      .mockResolvedValueOnce([{ userId: "u1", _count: { _all: 4 } }])
      .mockResolvedValueOnce([]);
    db.user.findMany.mockResolvedValue([
      { id: "u1", name: "On", email: "on@example.com", emailDigestEnabled: true },
    ]);
    db.$queryRaw.mockResolvedValue([]);
    db.notification.groupBy.mockResolvedValue([]);
    db.task.findMany
      .mockResolvedValueOnce([]) // assigned (ready-to-start) rows
      .mockResolvedValueOnce([
        { id: "a", title: "Low far", priority: "LOW", dueDate: null, updatedAt: now, userId: "u1", assignees: [] },
        { id: "b", title: "Overdue one", priority: "LOW", dueDate: new Date(now.getTime() - day), updatedAt: now, userId: "u1", assignees: [] },
        { id: "c", title: "High one", priority: "HIGH", dueDate: null, updatedAt: now, userId: "x", assignees: [{ userId: "u1" }] },
        { id: "d", title: "Stale one", priority: "MEDIUM", dueDate: null, updatedAt: new Date(now.getTime() - 5 * day), userId: "x", assignees: [{ userId: "u1" }] },
      ]);
    sendEmail.mockResolvedValue({ success: true, dev: true });

    await expect(sendDailyDigests(now)).resolves.toBe(1);
    const [, , html] = sendEmail.mock.calls[0];
    expect(html).toContain("Your top 3 today");
    const top = html.slice(html.indexOf("Your top 3 today"));
    expect(top.indexOf("Overdue one")).toBeLessThan(top.indexOf("High one"));
    expect(top.indexOf("High one")).toBeLessThan(top.indexOf("Stale one"));
    expect(top).not.toContain("Low far");
    expect(html).toContain("<strong>1</strong> stale");
  });

  it("sends nothing when nobody has pending tasks", async () => {
    db.task.groupBy.mockResolvedValueOnce([]);
    await expect(sendDailyDigests()).resolves.toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
