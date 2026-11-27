import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  task: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  workspaceMember: { findFirst: vi.fn(), findMany: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  notification: { createMany: vi.fn() },
  taskActivity: { create: vi.fn() },
  telegramDigestLog: { findFirst: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/realtime", () => ({ broadcastTaskEvent: vi.fn() }));
vi.mock("@/lib/projects", () => ({ nextSectionPosition: vi.fn(async () => 0) }));

import { parseNudgeReply, clampSnoozeDays } from "@/lib/nudge-reply-parser";
import { formatTelegramDailyDigest, verifyTelegramSecret, telegramDeepLink } from "@/lib/telegram";
import {
  applyTaskCommand,
  handleTelegramUpdate,
  parseTaskIds,
  pickTaskFromDigest,
  sendTelegramDigests,
  snoozedDueDate,
} from "@/lib/telegram-nudges";
import { POST as webhookPOST } from "@/app/api/telegram/webhook/route";

const NOW = new Date("2026-11-27T08:00:00Z");
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  delete process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: { message_id: 77 } }) });
  vi.stubGlobal("fetch", fetchMock);
});

describe("parseNudgeReply", () => {
  it.each([
    ["done", { kind: "done", index: undefined }],
    ["Done", { kind: "done", index: undefined }],
    ["1 done", { kind: "done", index: 1 }],
    ["done 2", { kind: "done", index: 2 }],
    ["#3 done", { kind: "done", index: 3 }],
    ["/done", { kind: "done", index: undefined }],
    ["ho gaya", { kind: "done", index: undefined }],
  ])("%s", (text, expected) => expect(parseNudgeReply(text)).toEqual(expected));

  it("parses blocked with and without reason", () => {
    expect(parseNudgeReply("blocked")).toEqual({ kind: "blocked", index: undefined });
    expect(parseNudgeReply("2 blocked waiting on Client API")).toEqual({
      kind: "blocked",
      index: 2,
      reason: "waiting on Client API",
    });
    expect(parseNudgeReply("blocked: need design")).toEqual({ kind: "blocked", index: undefined, reason: "need design" });
    const long = parseNudgeReply(`blocked ${"x".repeat(900)}`);
    expect(long.kind === "blocked" && long.reason?.length).toBe(500);
  });

  it("parses snooze variants with default and clamping", () => {
    expect(parseNudgeReply("snooze")).toEqual({ kind: "snooze", index: undefined, days: 2 });
    expect(parseNudgeReply("snooze 2d")).toEqual({ kind: "snooze", index: undefined, days: 2 });
    expect(parseNudgeReply("3 snooze 3d")).toEqual({ kind: "snooze", index: 3, days: 3 });
    expect(parseNudgeReply("snooze 5 days")).toEqual({ kind: "snooze", index: undefined, days: 5 });
    expect(parseNudgeReply("+2d")).toEqual({ kind: "snooze", index: undefined, days: 2 });
    expect(parseNudgeReply("2 +4d")).toEqual({ kind: "snooze", index: 2, days: 4 });
    expect(parseNudgeReply("snooze 30d")).toEqual({ kind: "snooze", index: undefined, days: 14 });
    expect(parseNudgeReply("snooze 0d")).toEqual({ kind: "snooze", index: undefined, days: 1 });
    expect(clampSnoozeDays(Number.NaN)).toBe(2);
  });

  it("parses help, start, unlink and unknown", () => {
    expect(parseNudgeReply("help")).toEqual({ kind: "help" });
    expect(parseNudgeReply("/start abc_DEF-123")).toEqual({ kind: "start", token: "abc_DEF-123" });
    expect(parseNudgeReply("/start")).toEqual({ kind: "start" });
    expect(parseNudgeReply("/unlink")).toEqual({ kind: "unlink" });
    expect(parseNudgeReply("what's up")).toEqual({ kind: "unknown" });
    expect(parseNudgeReply("")).toEqual({ kind: "unknown" });
  });
});

describe("telegram helpers", () => {
  it("formats a numbered digest", () => {
    const text = formatTelegramDailyDigest("Raghav Ji", [
      { title: "Send invoice", reason: "overdue" },
      { title: "Fix login", reason: "due soon" },
    ]);
    expect(text).toContain("Hi Raghav, your TaskFlow top 2 today:");
    expect(text).toContain("1. Send invoice (overdue)");
    expect(text).toContain("2. Fix login (due soon)");
    expect(text).toContain("1 done · 2 blocked <reason> · 3 snooze 2d");
    expect(formatTelegramDailyDigest("A", [{ title: "Only one" }])).toContain("done · blocked <reason> · snooze 2d");
  });

  it("verifies the webhook secret in constant time and fails closed", () => {
    expect(verifyTelegramSecret("s3cret", "s3cret")).toBe(true);
    expect(verifyTelegramSecret("s3creX", "s3cret")).toBe(false);
    expect(verifyTelegramSecret("short", "s3cret")).toBe(false);
    expect(verifyTelegramSecret(null, "s3cret")).toBe(false);
    expect(verifyTelegramSecret("anything", undefined)).toBe(false);
    expect(verifyTelegramSecret("", "")).toBe(false);
  });

  it("builds deep links only with a bot username", () => {
    expect(telegramDeepLink("tok", "TaskFlowBot")).toBe("https://t.me/TaskFlowBot?start=tok");
    expect(telegramDeepLink("tok", null)).toBeNull();
  });

  it("picks tasks from a digest", () => {
    expect(parseTaskIds('["a","b"]')).toEqual(["a", "b"]);
    expect(parseTaskIds("not json")).toEqual([]);
    expect(pickTaskFromDigest(["a", "b"], 2)).toEqual({ taskId: "b" });
    expect(pickTaskFromDigest(["a"], undefined)).toEqual({ taskId: "a" });
    expect(pickTaskFromDigest(["a", "b"], undefined)).toHaveProperty("error");
    expect(pickTaskFromDigest(["a", "b"], 3)).toHaveProperty("error");
    expect(pickTaskFromDigest([], 1)).toHaveProperty("error");
  });

  it("snoozes from the future due date, else from now", () => {
    const future = new Date("2026-11-30T00:00:00Z");
    expect(snoozedDueDate(future, 2, NOW).toISOString()).toBe("2026-12-02T00:00:00.000Z");
    expect(snoozedDueDate(new Date("2026-11-01T00:00:00Z"), 2, NOW).toISOString()).toBe("2026-11-29T08:00:00.000Z");
    expect(snoozedDueDate(null, 3, NOW).toISOString()).toBe("2026-11-30T08:00:00.000Z");
  });
});

const baseTask = {
  id: "t1",
  title: "Ship pricing page",
  status: "PENDING",
  dueDate: null,
  userId: "owner",
  workspaceId: "w1",
  projectId: null,
  sectionId: null,
  position: 0,
  priority: "MEDIUM",
  description: null,
  categoryId: null,
  recurrenceRule: null,
  assignees: [{ userId: "u1" }],
};

describe("applyTaskCommand", () => {
  it("marks done and clears blocker", async () => {
    db.task.findFirst.mockResolvedValue(baseTask);
    db.workspaceMember.findFirst.mockResolvedValue({ role: "MEMBER" });
    const res = await applyTaskCommand("u1", "t1", { kind: "done" }, NOW);
    expect(res.ok).toBe(true);
    expect(db.task.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { status: "COMPLETED", completedAt: NOW, blockerNote: null, blockedAt: null },
    });
    expect(db.taskActivity.create).toHaveBeenCalled();
  });

  it("rejects viewers and non-members", async () => {
    db.task.findFirst.mockResolvedValue(baseTask);
    db.workspaceMember.findFirst.mockResolvedValue({ role: "VIEWER" });
    expect((await applyTaskCommand("u1", "t1", { kind: "done" }, NOW)).ok).toBe(false);
    db.workspaceMember.findFirst.mockResolvedValue(null);
    expect((await applyTaskCommand("u9", "t1", { kind: "done" }, NOW)).ok).toBe(false);
    expect(db.task.update).not.toHaveBeenCalled();
  });

  it("rejects personal tasks of other users", async () => {
    db.task.findFirst.mockResolvedValue({ ...baseTask, workspaceId: null, assignees: [] });
    expect((await applyTaskCommand("u1", "t1", { kind: "done" }, NOW)).ok).toBe(false);
  });

  it("snoozes due date", async () => {
    db.task.findFirst.mockResolvedValue(baseTask);
    db.workspaceMember.findFirst.mockResolvedValue({ role: "MEMBER" });
    await applyTaskCommand("u1", "t1", { kind: "snooze", days: 2 }, NOW);
    expect(db.task.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { dueDate: new Date("2026-11-29T08:00:00Z") } });
  });

  it("blocks, saves note and notifies owners/admins + creator but not the reporter", async () => {
    db.task.findFirst.mockResolvedValue(baseTask);
    db.workspaceMember.findFirst.mockResolvedValue({ role: "MEMBER" });
    db.workspaceMember.findMany.mockResolvedValue([{ userId: "admin" }, { userId: "u1" }]);
    db.user.findUnique.mockResolvedValue({ name: "Asha" });
    const res = await applyTaskCommand("u1", "t1", { kind: "blocked", reason: "waiting on API" }, NOW);
    expect(res.message).toContain("waiting on API");
    expect(db.task.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { blockerNote: "waiting on API", blockedAt: NOW } });
    const data = db.notification.createMany.mock.calls[0][0].data;
    expect(data.map((n: { userId: string }) => n.userId).sort()).toEqual(["admin", "owner"]);
    expect(data[0].type).toBe("task_blocked");
  });
});

describe("handleTelegramUpdate", () => {
  const msg = (text: string, extra: Record<string, unknown> = {}) => ({
    message: { message_id: 10, text, chat: { id: 555, type: "private" }, ...extra },
  });

  it("links a chat with /start <token>", async () => {
    db.user.findUnique.mockResolvedValueOnce({ id: "u1", name: "Asha K" });
    const reply = await handleTelegramUpdate(msg("/start tok123"), NOW);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { telegramChatId: "555", telegramLinkToken: null, telegramLinkedAt: NOW },
    });
    expect(reply).toContain("Linked, Asha");
  });

  it("ignores group chats and asks unlinked chats to connect", async () => {
    expect(await handleTelegramUpdate({ message: { message_id: 1, text: "done", chat: { id: 1, type: "group" } } })).toBeNull();
    db.user.findUnique.mockResolvedValueOnce(null);
    expect(await handleTelegramUpdate(msg("done"), NOW)).toContain("isn't linked");
  });

  it("applies '2 done' against the replied-to digest", async () => {
    db.user.findUnique.mockResolvedValueOnce({ id: "u1" });
    db.telegramDigestLog.findFirst.mockResolvedValue({ taskIdsJson: '["t0","t1"]' });
    db.task.findFirst.mockResolvedValue(baseTask);
    db.workspaceMember.findFirst.mockResolvedValue({ role: "MEMBER" });
    const reply = await handleTelegramUpdate(msg("2 done", { reply_to_message: { message_id: 77 } }), NOW);
    expect(db.telegramDigestLog.findFirst.mock.calls[0][0].where).toMatchObject({ userId: "u1", chatId: "555", telegramMessageId: "77" });
    expect(db.task.findFirst.mock.calls[0][0].where.AND[0]).toMatchObject({ id: "t1" });
    expect(reply).toContain("Marked done");
  });
});

describe("webhook route", () => {
  const req = (secret?: string) =>
    new Request("http://localhost/api/telegram/webhook", {
      method: "POST",
      headers: secret ? { "x-telegram-bot-api-secret-token": secret } : {},
      body: JSON.stringify({ message: { message_id: 1, text: "help", chat: { id: 1, type: "private" } } }),
    });

  it("401s when the secret env is missing or header is wrong", async () => {
    expect((await webhookPOST(req("x"))).status).toBe(401);
    process.env.TELEGRAM_WEBHOOK_SECRET = "right-secret";
    expect((await webhookPOST(req("wrong-secre"))).status).toBe(401);
    expect((await webhookPOST(req())).status).toBe(401);
  });

  it("200s with the right secret", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "right-secret";
    db.user.findUnique.mockResolvedValueOnce({ id: "u1" });
    expect((await webhookPOST(req("right-secret"))).status).toBe(200);
  });
});

describe("sendTelegramDigests", () => {
  it("no-ops without a bot token", async () => {
    expect(await sendTelegramDigests(NOW)).toBe(0);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("sends a numbered digest and logs task ids in order", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    db.user.findMany.mockResolvedValue([{ id: "u1", name: "Asha", telegramChatId: "555" }]);
    db.task.findMany.mockResolvedValue([
      { id: "later", title: "Later", dueDate: null, priority: "LOW" },
      { id: "late", title: "Late", dueDate: new Date("2026-11-20T00:00:00Z"), priority: "MEDIUM" },
    ]);
    expect(await sendTelegramDigests(NOW)).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.telegramDigestLog.create).toHaveBeenCalledWith({
      data: { userId: "u1", chatId: "555", telegramMessageId: "77", taskIdsJson: '["late","later"]' },
    });
  });
});
