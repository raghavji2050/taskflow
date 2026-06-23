import type { ScheduledMessageStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canPostToConversation } from "@/lib/chat-access";
import { getConversationDisplayName, getMentionCandidatesForConversation } from "@/lib/conversations";
import {
  attachmentPlaceholderBody,
} from "@/lib/attachments";
import { notifyParticipants, sendMessage } from "@/lib/messages";
import { messageInclude, formatMessageForClient } from "@/lib/message-format";
import { deleteAttachmentUrl } from "@/lib/blob-storage";
import {
  assertScheduledInFuture,
  localDateTimeToUtc,
} from "@/lib/schedule-message-time";
import {
  formatScheduledMessageForClient,
  scheduledMessageInclude,
} from "@/lib/scheduled-message-format";
import { saveScheduledAttachmentFile } from "@/lib/scheduled-message-upload";

const BATCH_LIMIT = 50;

function resolveScheduledFor(input: {
  scheduledFor?: string | null;
  date?: string | null;
  time?: string | null;
  timezone: string;
}): Date {
  if (input.scheduledFor) {
    return new Date(input.scheduledFor);
  }
  if (input.date && input.time) {
    return localDateTimeToUtc(input.date, input.time, input.timezone);
  }
  throw new Error("Scheduled time is required");
}

async function getOwnedPending(id: string, userId: string) {
  const row = await prisma.scheduledMessage.findFirst({
    where: { id, userId, status: "PENDING" },
    include: scheduledMessageInclude,
  });
  if (!row) throw new Error("Scheduled message not found");
  return row;
}

async function cleanupAttachments(urls: string[]) {
  await Promise.all(urls.map((url) => deleteAttachmentUrl(url)));
}

export async function createScheduledMessage(params: {
  userId: string;
  userName: string;
  conversationId: string;
  body: string;
  parentId?: string | null;
  scheduledFor?: string | null;
  date?: string | null;
  time?: string | null;
  timezone: string;
  files?: File[];
}) {
  const participant = await canPostToConversation(params.userId, params.conversationId);
  if (!participant) throw new Error("Forbidden");

  const trimmed = params.body.trim();
  const files = params.files ?? [];
  if (!trimmed && files.length === 0) {
    throw new Error("Message or attachment required");
  }

  const scheduledFor = resolveScheduledFor({
    scheduledFor: params.scheduledFor,
    date: params.date,
    time: params.time,
    timezone: params.timezone,
  });
  assertScheduledInFuture(scheduledFor);

  const messageBody =
    trimmed ||
    attachmentPlaceholderBody(
      files.length,
      files.map((f) => f.name)
    );

  const savedAttachments = await Promise.all(
    files.map((file) => saveScheduledAttachmentFile(params.userId, file))
  );

  const row = await prisma.scheduledMessage.create({
    data: {
      body: messageBody,
      userId: params.userId,
      conversationId: params.conversationId,
      parentId: params.parentId ?? null,
      scheduledFor,
      timezone: params.timezone,
      attachments: {
        create: savedAttachments,
      },
    },
    include: scheduledMessageInclude,
  });

  return formatScheduledMessageForClient(row, params.userId);
}

export async function listScheduledMessagesForUser(
  userId: string,
  options: {
    status?: ScheduledMessageStatus | "ALL";
    conversationId?: string;
    page?: number;
    limit?: number;
  } = {}
) {
  const page = options.page ?? 1;
  const limit = options.limit ?? 50;
  const where = {
    userId,
    ...(options.status && options.status !== "ALL" ? { status: options.status } : {}),
    ...(options.conversationId ? { conversationId: options.conversationId } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.scheduledMessage.findMany({
      where,
      orderBy: { scheduledFor: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      include: scheduledMessageInclude,
    }),
    prisma.scheduledMessage.count({ where }),
  ]);

  return {
    scheduledMessages: rows.map((r) => formatScheduledMessageForClient(r, userId)),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export async function listScheduledMessagesForConversation(
  conversationId: string,
  userId: string
) {
  const participant = await canPostToConversation(userId, conversationId);
  if (!participant) throw new Error("Forbidden");

  const rows = await prisma.scheduledMessage.findMany({
    where: {
      conversationId,
      userId,
      status: "PENDING",
    },
    orderBy: { scheduledFor: "asc" },
    include: scheduledMessageInclude,
  });

  return rows.map((r) => formatScheduledMessageForClient(r, userId));
}

export async function updateScheduledMessage(
  id: string,
  userId: string,
  input: {
    body?: string;
    scheduledFor?: string | null;
    date?: string | null;
    time?: string | null;
    timezone?: string;
    removeAttachmentIds?: string[];
    files?: File[];
  }
) {
  const existing = await getOwnedPending(id, userId);
  const timezone = input.timezone ?? existing.timezone;

  let scheduledFor = existing.scheduledFor;
  if (input.scheduledFor || (input.date && input.time)) {
    scheduledFor = resolveScheduledFor({
      scheduledFor: input.scheduledFor,
      date: input.date,
      time: input.time,
      timezone,
    });
    assertScheduledInFuture(scheduledFor);
  }

  const removeIds = input.removeAttachmentIds ?? [];
  const toRemove = existing.attachments.filter((a) => removeIds.includes(a.id));
  if (toRemove.length > 0) {
    await prisma.scheduledMessageAttachment.deleteMany({
      where: { id: { in: toRemove.map((a) => a.id) }, scheduledMessageId: id },
    });
    void cleanupAttachments(toRemove.map((a) => a.url));
  }

  const newFiles = input.files ?? [];
  const savedAttachments = await Promise.all(
    newFiles.map((file) => saveScheduledAttachmentFile(userId, file))
  );
  if (savedAttachments.length > 0) {
    await prisma.scheduledMessageAttachment.createMany({
      data: savedAttachments.map((a) => ({ ...a, scheduledMessageId: id })),
    });
  }

  const attachmentCount = await prisma.scheduledMessageAttachment.count({
    where: { scheduledMessageId: id },
  });
  let nextBody = input.body !== undefined ? input.body.trim() : existing.body;
  if (!nextBody && attachmentCount > 0) {
    const names = (
      await prisma.scheduledMessageAttachment.findMany({
        where: { scheduledMessageId: id },
        select: { filename: true },
      })
    ).map((a) => a.filename);
    nextBody = attachmentPlaceholderBody(attachmentCount, names);
  }
  if (!nextBody && attachmentCount === 0) {
    throw new Error("Message or attachment required");
  }

  const row = await prisma.scheduledMessage.update({
    where: { id },
    data: {
      ...(input.body !== undefined || attachmentCount > 0 ? { body: nextBody } : {}),
      scheduledFor,
      timezone,
    },
    include: scheduledMessageInclude,
  });

  return formatScheduledMessageForClient(row, userId);
}

export async function cancelScheduledMessage(id: string, userId: string) {
  const existing = await getOwnedPending(id, userId);
  const row = await prisma.scheduledMessage.update({
    where: { id },
    data: { status: "CANCELLED" },
    include: scheduledMessageInclude,
  });
  void cleanupAttachments(existing.attachments.map((a) => a.url));
  return formatScheduledMessageForClient(row, userId);
}

export async function deleteScheduledMessage(id: string, userId: string) {
  const existing = await prisma.scheduledMessage.findFirst({
    where: { id, userId, status: { in: ["PENDING", "CANCELLED"] } },
    include: { attachments: true },
  });
  if (!existing) throw new Error("Scheduled message not found");

  await prisma.scheduledMessage.delete({ where: { id } });
  void cleanupAttachments(existing.attachments.map((a) => a.url));
  return { ok: true };
}

export async function deliverScheduledMessage(id: string, userId: string, userName: string) {
  const claimed = await prisma.scheduledMessage.updateMany({
    where: { id, userId, status: "PENDING" },
    data: { status: "SENT", sentAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new Error("Scheduled message not found or already processed");
  }

  const row = await prisma.scheduledMessage.findUniqueOrThrow({
    where: { id },
    include: {
      ...scheduledMessageInclude,
      conversation: {
        include: {
          workspace: { select: { name: true } },
          participants: { include: { user: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  try {
    const participant = await canPostToConversation(userId, row.conversationId);
    if (!participant) {
      await prisma.scheduledMessage.update({
        where: { id },
        data: { status: "PENDING", sentAt: null },
      });
      throw new Error("Forbidden");
    }

    const { conversation } = participant;
    const conversationTitle = getConversationDisplayName(conversation, userId);
    const mentionCandidates = await getMentionCandidatesForConversation(conversation);
    const hasAttachments = row.attachments.length > 0;

    let message = await sendMessage({
      conversationId: row.conversationId,
      userId,
      userName,
      body: row.body,
      parentId: row.parentId,
      conversationTitle,
      mentionCandidates,
      skipNotify: hasAttachments,
    });

    if (hasAttachments) {
      const attachmentPreview =
        row.attachments.length === 1
          ? `📎 ${row.attachments[0]!.filename}`
          : `📎 ${row.attachments.length} files`;

      await notifyParticipants({
        conversationId: row.conversationId,
        userId,
        userName,
        preview: attachmentPreview,
        conversationTitle,
        mentionCandidates,
        body: row.body,
        messageId: message.id,
        message,
        type: "message:created",
      });

      await prisma.messageAttachment.createMany({
        data: row.attachments.map((a) => ({
          messageId: message.id,
          filename: a.filename,
          url: a.url,
          mimeType: a.mimeType,
          size: a.size,
        })),
      });

      const full = await prisma.message.findUniqueOrThrow({
        where: { id: message.id },
        include: messageInclude,
      });
      message = formatMessageForClient(full);

      void notifyParticipants({
        conversationId: row.conversationId,
        userId,
        userName,
        preview: attachmentPreview,
        conversationTitle,
        mentionCandidates,
        body: row.body,
        messageId: message.id,
        message,
        type: "message:updated",
      });
    }

    await prisma.scheduledMessage.update({
      where: { id },
      data: { messageId: message.id },
    });

    return { scheduledMessage: row, message };
  } catch (error) {
    await prisma.scheduledMessage.update({
      where: { id },
      data: { status: "PENDING", sentAt: null },
    });
    throw error;
  }
}

export async function sendScheduledMessageNow(id: string, userId: string, userName: string) {
  await getOwnedPending(id, userId);
  return deliverScheduledMessage(id, userId, userName);
}

export async function deliverDueScheduledMessages(now = new Date()) {
  const due = await prisma.scheduledMessage.findMany({
    where: {
      status: "PENDING",
      scheduledFor: { lte: now },
    },
    orderBy: { scheduledFor: "asc" },
    take: BATCH_LIMIT,
    include: { user: { select: { id: true, name: true } } },
  });

  let sent = 0;
  let failed = 0;

  for (const item of due) {
    try {
      await deliverScheduledMessage(item.id, item.userId, item.user.name);
      sent += 1;
    } catch {
      failed += 1;
    }
  }

  return { processed: due.length, sent, failed };
}
