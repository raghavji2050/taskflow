import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logTaskActivity } from "@/lib/activity";
import { getNextDueDate } from "@/lib/recurrence";
import { nextSectionPosition } from "@/lib/projects";
import { broadcastTaskEvent } from "@/lib/realtime";
import { visibleTaskWhere } from "@/lib/visible-records";
import { canEditWorkspaceTasks } from "@/lib/workspace-permissions";
import { pickTopTasks } from "@/lib/active-pm";
import {
  MAX_BLOCKER_LENGTH,
  NUDGE_REPLY_HELP,
  parseNudgeReply,
  type NudgeCommand,
} from "@/lib/nudge-reply-parser";
import {
  formatTelegramDailyDigest,
  isTelegramConfigured,
  sendTelegramMessage,
  telegramBotUsername,
  telegramDeepLink,
} from "@/lib/telegram";

const DAY_MS = 24 * 60 * 60 * 1000;
export const TELEGRAM_DIGEST_SIZE = 5;
/** Plain "done" (no number, not a reply) resolves against the latest digest only if it is this fresh. */
const LATEST_DIGEST_MAX_AGE_MS = 3 * DAY_MS;

export type TaskCommand = Extract<NudgeCommand, { kind: "done" | "blocked" | "snooze" }>;

// ---- Pure helpers (unit-tested) ----

export function parseTaskIds(json: string | null | undefined): string[] {
  try {
    const value = JSON.parse(json ?? "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Pick the task a reply refers to from the digest it answers. */
export function pickTaskFromDigest(
  taskIds: string[],
  index: number | undefined
): { taskId: string } | { error: string } {
  if (taskIds.length === 0) return { error: "I couldn't find tasks for that message. Wait for your next digest." };
  if (index === undefined) {
    if (taskIds.length === 1) return { taskId: taskIds[0] };
    return { error: `Which task? Start with its number, e.g. "1 done" (1-${taskIds.length}).` };
  }
  if (index < 1 || index > taskIds.length) return { error: `Pick a number from 1 to ${taskIds.length}.` };
  return { taskId: taskIds[index - 1] };
}

/** New due date for a snooze: from the current due date if still in the future, else from now. */
export function snoozedDueDate(current: Date | null | undefined, days: number, now: Date): Date {
  const base = current && current.getTime() > now.getTime() ? current : now;
  return new Date(base.getTime() + days * DAY_MS);
}

export function newTelegramLinkToken(): string {
  return randomBytes(24).toString("base64url");
}

// ---- Applying a command ----

export type ApplyResult = { ok: boolean; message: string };

/** Apply done / blocked / snooze for `userId`. Re-checks access every time; never trusts the chat. */
export async function applyTaskCommand(
  userId: string,
  taskId: string,
  command: TaskCommand,
  now = new Date()
): Promise<ApplyResult> {
  const task = await prisma.task.findFirst({
    where: visibleTaskWhere({ id: taskId, archived: false }),
    select: {
      id: true,
      title: true,
      status: true,
      dueDate: true,
      userId: true,
      workspaceId: true,
      projectId: true,
      sectionId: true,
      position: true,
      priority: true,
      description: true,
      categoryId: true,
      recurrenceRule: true,
      assignees: { select: { userId: true } },
    },
  });
  if (!task) return { ok: false, message: "That task no longer exists or was archived." };

  if (task.workspaceId) {
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId, workspaceId: task.workspaceId, workspace: { archivedAt: null } },
    });
    if (!canEditWorkspaceTasks(membership)) return { ok: false, message: "You can't edit that task." };
  } else if (task.userId !== userId && !task.assignees.some((a) => a.userId === userId)) {
    return { ok: false, message: "You can't edit that task." };
  }

  const title = task.title.length > 80 ? `${task.title.slice(0, 77)}...` : task.title;

  if (command.kind === "done") {
    if (task.status === "COMPLETED") return { ok: true, message: `"${title}" is already done. ✅` };
    await prisma.task.update({
      where: { id: task.id },
      data: { status: "COMPLETED", completedAt: now, blockerNote: null, blockedAt: null },
    });
    await logTaskActivity(task.id, "updated", "Status: COMPLETED (via Telegram reply)");
    if (task.recurrenceRule && task.dueDate) {
      await prisma.task.create({
        data: {
          title: task.title,
          description: task.description,
          priority: task.priority,
          status: "PENDING",
          dueDate: getNextDueDate(task.dueDate, task.recurrenceRule),
          recurrenceRule: task.recurrenceRule,
          categoryId: task.categoryId,
          userId: task.userId,
          workspaceId: task.workspaceId,
          projectId: task.projectId,
          sectionId: task.sectionId,
          position: task.sectionId ? await nextSectionPosition(task.sectionId) : task.position + 1,
        },
      });
    }
    broadcast(task, userId);
    return { ok: true, message: `✅ Marked done: "${title}"` };
  }

  if (command.kind === "snooze") {
    const due = snoozedDueDate(task.dueDate, command.days, now);
    await prisma.task.update({ where: { id: task.id }, data: { dueDate: due } });
    await logTaskActivity(task.id, "updated", `Due date changed: snoozed ${command.days}d (via Telegram reply)`);
    broadcast(task, userId);
    return {
      ok: true,
      message: `⏰ Snoozed "${title}" by ${command.days} day${command.days === 1 ? "" : "s"}. New due: ${due.toISOString().slice(0, 10)}`,
    };
  }

  const reason = (command.reason ?? "").trim().slice(0, MAX_BLOCKER_LENGTH);
  const note = reason || "Blocked (no reason given)";
  await prisma.task.update({ where: { id: task.id }, data: { blockerNote: note, blockedAt: now } });
  await logTaskActivity(task.id, "blocked", `${note} (via Telegram reply)`);
  const notified = await notifyBlocked(task, userId, note);
  broadcast(task, userId);
  return {
    ok: true,
    message: `🚧 Marked blocked: "${title}"${reason ? `\nReason: ${reason}` : ""}${notified > 0 ? "\nYour team lead has been told." : ""}`,
  };
}

function broadcast(task: { id: string; workspaceId: string | null; userId: string }, actorId: string) {
  try {
    broadcastTaskEvent({ type: "task:updated", workspaceId: task.workspaceId, ownerId: task.userId, actorId, taskId: task.id });
  } catch {
    // realtime is best-effort
  }
}

/** In-app alert to workspace owners/admins and the task creator (not the person who reported it). */
async function notifyBlocked(
  task: { id: string; title: string; userId: string; workspaceId: string | null },
  reporterId: string,
  note: string
): Promise<number> {
  const recipients = new Set<string>();
  if (task.userId !== reporterId) recipients.add(task.userId);
  if (task.workspaceId) {
    const owners = await prisma.workspaceMember.findMany({
      where: { workspaceId: task.workspaceId, role: { in: ["OWNER", "ADMIN"] } },
      select: { userId: true },
    });
    for (const o of owners) if (o.userId !== reporterId) recipients.add(o.userId);
  }
  if (recipients.size === 0) return 0;
  const reporter = await prisma.user.findUnique({ where: { id: reporterId }, select: { name: true } });
  await prisma.notification.createMany({
    data: [...recipients].map((uid) => ({
      userId: uid,
      type: "task_blocked",
      title: "Task blocked",
      body: `${reporter?.name ?? "A teammate"} is blocked on "${task.title}": ${note}`.slice(0, 1000),
    })),
  });
  return recipients.size;
}

// ---- Webhook handling ----

export type TelegramUpdate = {
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number | string; type?: string };
    reply_to_message?: { message_id: number };
  };
};

/** Handle one incoming update. Returns the reply text that was sent (for tests/logs), or null. */
export async function handleTelegramUpdate(update: TelegramUpdate, now = new Date()): Promise<string | null> {
  const msg = update.message;
  if (!msg?.text || !msg.chat) return null;
  if (msg.chat.type && msg.chat.type !== "private") return null; // personal digests only
  const chatId = String(msg.chat.id);
  const reply = async (text: string) => {
    await sendTelegramMessage(chatId, text, msg.message_id);
    return text;
  };

  const command = parseNudgeReply(msg.text);

  if (command.kind === "start") {
    if (!command.token) return reply("Open TaskFlow → Settings → Telegram and tap “Connect Telegram” to link this chat.");
    const user = await prisma.user.findUnique({ where: { telegramLinkToken: command.token }, select: { id: true, name: true } });
    if (!user) return reply("That link has expired. Generate a new one in TaskFlow → Settings → Telegram.");
    await prisma.user.updateMany({ where: { telegramChatId: chatId, NOT: { id: user.id } }, data: { telegramChatId: null, telegramLinkedAt: null } });
    await prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: chatId, telegramLinkToken: null, telegramLinkedAt: now },
    });
    const first = user.name.split(" ")[0] || "there";
    return reply(`✅ Linked, ${first}! You'll get your TaskFlow top tasks here every day.\n\n${NUDGE_REPLY_HELP}`);
  }

  const user = await prisma.user.findUnique({ where: { telegramChatId: chatId }, select: { id: true } });
  if (command.kind === "unlink") {
    if (user) await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: null, telegramLinkedAt: null } });
    return reply("Unlinked. You won't get TaskFlow messages here any more.");
  }
  if (!user) return reply("This chat isn't linked yet. Open TaskFlow → Settings → Telegram to connect.");
  if (command.kind === "help") return reply(NUDGE_REPLY_HELP);
  if (command.kind === "unknown") return reply(`Sorry, I didn't get that.\n\n${NUDGE_REPLY_HELP}`);

  const log = msg.reply_to_message
    ? await prisma.telegramDigestLog.findFirst({
        where: { userId: user.id, chatId, telegramMessageId: String(msg.reply_to_message.message_id) },
        select: { taskIdsJson: true },
      })
    : await prisma.telegramDigestLog.findFirst({
        where: { userId: user.id, chatId, createdAt: { gte: new Date(now.getTime() - LATEST_DIGEST_MAX_AGE_MS) } },
        orderBy: { createdAt: "desc" },
        select: { taskIdsJson: true },
      });
  const picked = pickTaskFromDigest(parseTaskIds(log?.taskIdsJson), command.index);
  if ("error" in picked) return reply(picked.error);
  const result = await applyTaskCommand(user.id, picked.taskId, command, now);
  return reply(result.message);
}

// ---- Daily digest (from /api/cron/reminders) ----

export async function sendTelegramDigests(now = new Date()): Promise<number> {
  if (!isTelegramConfigured()) return 0;
  const users = await prisma.user.findMany({
    where: { telegramChatId: { not: null }, telegramDigestEnabled: true, activeNudgesEnabled: true },
    select: { id: true, name: true, telegramChatId: true },
    take: 1000,
  });
  let sent = 0;
  for (const user of users) {
    if (!user.telegramChatId) continue;
    try {
      const open = await prisma.task.findMany({
        where: visibleTaskWhere({
          archived: false,
          status: { not: "COMPLETED" },
          OR: [{ userId: user.id }, { assignees: { some: { userId: user.id } } }],
        }),
        select: { id: true, title: true, dueDate: true, priority: true },
        take: 500,
      });
      const top = pickTopTasks(open, now, TELEGRAM_DIGEST_SIZE);
      if (top.length === 0) continue;
      const result = await sendTelegramMessage(user.telegramChatId, formatTelegramDailyDigest(user.name, top));
      if (!result.ok) continue;
      await prisma.telegramDigestLog.create({
        data: {
          userId: user.id,
          chatId: user.telegramChatId,
          telegramMessageId: result.messageId,
          taskIdsJson: JSON.stringify(top.map((t) => t.id)),
        },
      });
      sent += 1;
    } catch (error) {
      console.warn("[telegram] digest failed for a user", error instanceof Error ? error.message : "unknown");
    }
  }
  return sent;
}

// ---- Settings ----

export const telegramPrefsSchema = z.object({ telegramDigestEnabled: z.boolean() });

export type TelegramStatus = {
  configured: boolean;
  botUsername: string | null;
  linked: boolean;
  linkedAt: string | null;
  telegramDigestEnabled: boolean;
};

export async function getTelegramStatus(userId: string): Promise<TelegramStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { telegramChatId: true, telegramLinkedAt: true, telegramDigestEnabled: true },
  });
  return {
    configured: isTelegramConfigured() && !!telegramBotUsername(),
    botUsername: telegramBotUsername(),
    linked: !!user?.telegramChatId,
    linkedAt: user?.telegramLinkedAt?.toISOString() ?? null,
    telegramDigestEnabled: user?.telegramDigestEnabled ?? true,
  };
}

export async function createTelegramLink(userId: string): Promise<{ url: string } | null> {
  const username = telegramBotUsername();
  if (!username || !isTelegramConfigured()) return null;
  const token = newTelegramLinkToken();
  await prisma.user.update({ where: { id: userId }, data: { telegramLinkToken: token } });
  return { url: telegramDeepLink(token, username)! };
}
