import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  taskFollower: { createMany: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
  workspaceMember: { findMany: vi.fn() },
}));
const notify = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/notifications", () => ({ createNotification: notify }));

import { followTask, notifyTaskFollowers, pickRecipients, statusLabel, unfollowTask } from "@/lib/task-followers";

beforeEach(() => vi.clearAllMocks());

describe("pickRecipients", () => {
  it("drops the actor, excluded users and duplicates", () => {
    expect(pickRecipients(["a", "b", "b", "c", "d"], { actorId: "a", exclude: ["c"] })).toEqual(["b", "d"]);
  });
  it("keeps only current workspace members when given", () => {
    expect(pickRecipients(["a", "b", "c"], { actorId: "x", memberIds: new Set(["a", "c"]) })).toEqual(["a", "c"]);
  });
});

describe("followTask / unfollowTask", () => {
  it("creates unique rows and skips duplicates", async () => {
    await followTask("t1", ["u1", "u1", "u2", ""]);
    expect(db.taskFollower.createMany).toHaveBeenCalledWith({
      data: [{ taskId: "t1", userId: "u1" }, { taskId: "t1", userId: "u2" }],
      skipDuplicates: true,
    });
  });
  it("does nothing for an empty list", async () => {
    await followTask("t1", []);
    expect(db.taskFollower.createMany).not.toHaveBeenCalled();
  });
  it("unfollow only removes that user's row", async () => {
    await unfollowTask("t1", "u1");
    expect(db.taskFollower.deleteMany).toHaveBeenCalledWith({ where: { taskId: "t1", userId: "u1" } });
  });
});

describe("notifyTaskFollowers", () => {
  it("notifies followers who are still members, except actor and mentioned", async () => {
    db.taskFollower.findMany.mockResolvedValue([{ userId: "actor" }, { userId: "m1" }, { userId: "f1" }, { userId: "gone" }]);
    db.workspaceMember.findMany.mockResolvedValue([{ userId: "actor" }, { userId: "m1" }, { userId: "f1" }]);
    const sent = await notifyTaskFollowers({
      taskId: "t1", workspaceId: "w1", actorId: "actor", title: "New comment", body: "b", type: "task_comment", exclude: ["m1"],
    });
    expect(sent).toEqual(["f1"]);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({ userId: "f1", title: "New comment", body: "b", type: "task_comment" });
  });
  it("skips the member lookup for personal tasks and returns early with no followers", async () => {
    db.taskFollower.findMany.mockResolvedValue([]);
    await expect(notifyTaskFollowers({ taskId: "t1", workspaceId: null, actorId: "a", title: "x", body: "y", type: "z" })).resolves.toEqual([]);
    expect(db.workspaceMember.findMany).not.toHaveBeenCalled();
  });
});

describe("statusLabel", () => {
  it("maps statuses to friendly labels", () => {
    expect(statusLabel("COMPLETED")).toBe("Done");
    expect(statusLabel("IN_PROGRESS")).toBe("In progress");
    expect(statusLabel("OTHER")).toBe("OTHER");
  });
});
