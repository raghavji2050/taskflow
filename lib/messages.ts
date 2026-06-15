import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { messageInclude, formatMessageForClient } from "@/lib/message-format";
import { createNotification } from "@/lib/notifications";
import { parseMentionsFromBody } from "@/lib/mentions";
import { broadcastMessageEvent, broadcastMessageToConversation, broadcastConversationReceipt } from "@/lib/realtime";
import { getConversationParticipantIds } from "@/lib/chat-access";
import { attachReceiptStatuses, type ParticipantReceipt } from "@/lib/chat-receipts";

async function getParticipantClearedAt(conversationId: string, userId: string) {
  const row = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { clearedAt: true },
  });
  return row?.clearedAt ?? null;
}

function afterCleared(clearedAt: Date | null) {
  return clearedAt ? { createdAt: { gt: clearedAt } } : {};
}

function messageTimeFilter(clearedAt: Date | null, cursor?: string) {
  const createdAt: { gt?: Date; lt?: Date } = {};
  if (clearedAt) createdAt.gt = clearedAt;
  if (cursor) createdAt.lt = new Date(cursor);
  return Object.keys(createdAt).length > 0 ? { createdAt } : {};
}

function dayBounds(dateKey: string) {
  const start = new Date(`${dateKey}T00:00:00.000`);
  const end = new Date(`${dateKey}T23:59:59.999`);
  return { start, end };
}

export async function listMessages(
  conversationId: string,
  userId: string,
  options: { cursor?: string; limit?: number }
) {
  const clearedAt = await getParticipantClearedAt(conversationId, userId);
  const limit = options.limit ?? 50;
  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      ...messageTimeFilter(clearedAt, options.cursor),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    include: messageInclude,
  });

  const hasMore = messages.length > limit;
  const items = hasMore ? messages.slice(0, limit) : messages;
  const nextCursor = hasMore ? items[items.length - 1]?.createdAt.toISOString() : null;

  const pinned = await prisma.message.findMany({
    where: {
      conversationId,
      pinnedAt: { not: null },
      deletedAt: null,
      ...afterCleared(clearedAt),
    },
    orderBy: { pinnedAt: "desc" },
    include: messageInclude,
  });

  const receipts = await getConversationReceipts(conversationId, userId);
  const formatted = items.reverse().map(formatMessageForClient);

  return {
    messages: attachReceiptStatuses(formatted, userId, receipts),
    pinned: attachReceiptStatuses(pinned.map(formatMessageForClient), userId, receipts),
    receipts,
    nextCursor,
    hasMore,
  };
}

export async function searchMessages(
  conversationId: string,
  userId: string,
  query: string,
  limit = 30
) {
  const clearedAt = await getParticipantClearedAt(conversationId, userId);
  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      deletedAt: null,
      body: { contains: query },
      ...afterCleared(clearedAt),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: messageInclude,
  });

  return messages.map(formatMessageForClient);
}

export async function searchMessagesGlobal(userId: string, query: string, limit = 40) {
  const participations = await prisma.conversationParticipant.findMany({
    where: { userId },
    select: { conversationId: true, clearedAt: true },
  });
  if (participations.length === 0) return [];

  const clearedMap = new Map(
    participations.map((p) => [p.conversationId, p.clearedAt] as const)
  );
  const convIds = participations.map((p) => p.conversationId);

  const rows = await prisma.message.findMany({
    where: {
      conversationId: { in: convIds },
      deletedAt: null,
      body: { contains: query },
    },
    orderBy: { createdAt: "desc" },
    take: limit * 3,
    include: messageInclude,
  });

  return rows
    .filter((m) => {
      const cleared = clearedMap.get(m.conversationId);
      return !cleared || m.createdAt > cleared;
    })
    .slice(0, limit)
    .map((m) => ({
      ...formatMessageForClient(m),
      conversationId: m.conversationId,
    }));
}

export async function listMessageDates(conversationId: string, userId: string) {
  const clearedAt = await getParticipantClearedAt(conversationId, userId);
  const rows = await prisma.message.findMany({
    where: {
      conversationId,
      deletedAt: null,
      ...afterCleared(clearedAt),
    },
    select: { createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return [...new Set(rows.map((r) => r.createdAt.toISOString().slice(0, 10)))];
}

export async function getMessagesForDate(
  conversationId: string,
  userId: string,
  dateKey: string
) {
  const clearedAt = await getParticipantClearedAt(conversationId, userId);
  const { start, end } = dayBounds(dateKey);

  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      deletedAt: null,
      createdAt: { gte: start, lte: end },
      ...afterCleared(clearedAt),
    },
    orderBy: { createdAt: "asc" },
    include: messageInclude,
  });

  const hasMoreBefore = await prisma.message.count({
    where: {
      conversationId,
      deletedAt: null,
      createdAt: { lt: start },
      ...afterCleared(clearedAt),
    },
  });

  const hasMoreAfter = await prisma.message.count({
    where: {
      conversationId,
      deletedAt: null,
      createdAt: { gt: end },
      ...afterCleared(clearedAt),
    },
  });

  return {
    messages: messages.map(formatMessageForClient),
    date: dateKey,
    hasMoreBefore: hasMoreBefore > 0,
    hasMoreAfter: hasMoreAfter > 0,
  };
}

export async function clearConversationForUser(conversationId: string, userId: string) {
  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { clearedAt: new Date(), lastReadAt: new Date() },
  });
}

async function notifyParticipants(params: {
  conversationId: string;
  userId: string;
  userName: string;
  preview: string;
  conversationTitle: string;
  mentionCandidates: { id: string; name: string }[];
  body: string;
  messageId: string;
  message?: ReturnType<typeof formatMessageForClient>;
  type?: "message:created" | "message:updated";
}) {
  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId: params.conversationId, userId: { not: params.userId } },
    select: { userId: true },
  });
  const participantIds = participants.map((p) => p.userId);

  if (params.type === "message:updated") {
    broadcastMessageToConversation(participantIds, {
      conversationId: params.conversationId,
      messageId: params.messageId,
      actorId: params.userId,
      preview: params.preview,
      type: "message:updated",
      message: params.message,
    });
    return;
  }

  const mentioned = parseMentionsFromBody(params.body, params.mentionCandidates);
  const mentionedIds = new Set(mentioned.map((m) => m.id));

  for (const participant of participants) {
    const participantId = participant.userId;
    if (mentionedIds.has(participantId)) continue;

    broadcastMessageEvent({
      type: "message:created",
      conversationId: params.conversationId,
      messageId: params.messageId,
      senderId: params.userId,
      preview: params.preview,
      recipientId: participantId,
      message: params.message,
    });

    await createNotification({
      userId: participantId,
      title: `New message in ${params.conversationTitle}`,
      body: `${params.userName}: ${params.preview}`,
      type: "message",
      conversationId: params.conversationId,
      messageId: params.messageId,
    });
  }

  for (const m of mentioned) {
    if (m.id === params.userId) continue;

    broadcastMessageEvent({
      type: "message:created",
      conversationId: params.conversationId,
      messageId: params.messageId,
      senderId: params.userId,
      preview: params.preview,
      recipientId: m.id,
      message: params.message,
    });

    await createNotification({
      userId: m.id,
      title: "You were mentioned",
      body: `${params.userName} mentioned you in ${params.conversationTitle}`,
      type: "mention",
      conversationId: params.conversationId,
      messageId: params.messageId,
    });
  }
}

export async function sendMessage(params: {
  conversationId: string;
  userId: string;
  userName: string;
  body: string;
  parentId?: string | null;
  conversationTitle: string;
  mentionCandidates: { id: string; name: string }[];
}) {
  const { conversationId, userId, userName, body, parentId, conversationTitle, mentionCandidates } =
    params;

  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error("Message cannot be empty");
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      userId,
      body: trimmed,
      parentId: parentId ?? null,
    },
    include: messageInclude,
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  await prisma.conversationParticipant.updateMany({
    where: { conversationId },
    data: { archivedAt: null },
  });

  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadAt: new Date() },
  });

  const preview = trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
  const formatted = formatMessageForClient(message);

  await notifyParticipants({
    conversationId,
    userId,
    userName,
    preview,
    conversationTitle,
    mentionCandidates,
    body: trimmed,
    messageId: message.id,
    message: formatted,
    type: "message:created",
  });

  return formatted;
}

export async function updateMessage(params: {
  messageId: string;
  conversationId: string;
  userId: string;
  body: string;
}) {
  const msg = await prisma.message.findFirst({
    where: { id: params.messageId, conversationId: params.conversationId },
  });
  if (!msg) throw new Error("Message not found");
  if (msg.userId !== params.userId) throw new Error("Forbidden");
  if (msg.deletedAt) throw new Error("Cannot edit a deleted message");

  const trimmed = params.body.trim();
  if (!trimmed) throw new Error("Message cannot be empty");

  const message = await prisma.message.update({
    where: { id: params.messageId },
    data: { body: trimmed, editedAt: new Date() },
    include: messageInclude,
  });

  const formatted = formatMessageForClient(message);
  const participantIds = await getConversationParticipantIds(params.conversationId);
  broadcastMessageToConversation(participantIds, {
    conversationId: params.conversationId,
    messageId: params.messageId,
    actorId: params.userId,
    preview: "Message edited",
    type: "message:updated",
    message: formatted,
  });

  return formatted;
}

export async function deleteMessage(params: {
  messageId: string;
  conversationId: string;
  userId: string;
}) {
  const msg = await prisma.message.findFirst({
    where: { id: params.messageId, conversationId: params.conversationId },
  });
  if (!msg) throw new Error("Message not found");
  if (msg.userId !== params.userId) throw new Error("Forbidden");
  if (msg.deletedAt) {
    return formatMessageForClient(
      await prisma.message.findUniqueOrThrow({
        where: { id: params.messageId },
        include: messageInclude,
      })
    );
  }

  const message = await prisma.message.update({
    where: { id: params.messageId },
    data: {
      deletedAt: new Date(),
      body: "",
      pinnedAt: null,
      pinnedById: null,
    },
    include: messageInclude,
  });

  const formatted = formatMessageForClient(message);
  const participantIds = await getConversationParticipantIds(params.conversationId);
  broadcastMessageToConversation(participantIds, {
    conversationId: params.conversationId,
    messageId: params.messageId,
    actorId: params.userId,
    preview: "Message deleted",
    type: "message:updated",
    message: formatted,
  });

  return formatted;
}

export async function addMessageAttachment(params: {
  messageId: string;
  conversationId: string;
  userId: string;
  file: File;
}) {
  const bytes = await params.file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const uploadDir = path.join(process.cwd(), "public", "uploads", params.userId);
  await mkdir(uploadDir, { recursive: true });

  const filename = `${Date.now()}-${params.file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const filepath = path.join(uploadDir, filename);
  await writeFile(filepath, buffer);

  const attachment = await prisma.messageAttachment.create({
    data: {
      messageId: params.messageId,
      filename: params.file.name,
      url: `/uploads/${params.userId}/${filename}`,
      mimeType: params.file.type || "application/octet-stream",
      size: buffer.length,
    },
  });

  const message = await prisma.message.findUniqueOrThrow({
    where: { id: params.messageId },
    include: messageInclude,
  });

  return { attachment, message: formatMessageForClient(message) };
}

export async function toggleMessageReaction(params: {
  messageId: string;
  conversationId: string;
  userId: string;
  emoji: string;
}) {
  const existing = await prisma.messageReaction.findUnique({
    where: {
      messageId_userId_emoji: {
        messageId: params.messageId,
        userId: params.userId,
        emoji: params.emoji,
      },
    },
  });

  if (existing) {
    await prisma.messageReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.messageReaction.create({
      data: {
        messageId: params.messageId,
        userId: params.userId,
        emoji: params.emoji,
      },
    });
  }

  return formatMessageForClient(
    await prisma.message.findUniqueOrThrow({
      where: { id: params.messageId },
      include: messageInclude,
    })
  );
}

export async function setMessagePinned(params: {
  messageId: string;
  conversationId: string;
  userId: string;
  pinned: boolean;
}) {
  await prisma.message.update({
    where: { id: params.messageId },
    data: params.pinned
      ? { pinnedAt: new Date(), pinnedById: params.userId }
      : { pinnedAt: null, pinnedById: null },
  });

  const message = await prisma.message.findUniqueOrThrow({
    where: { id: params.messageId },
    include: messageInclude,
  });
  const formatted = formatMessageForClient(message);

  const participantIds = await getConversationParticipantIds(params.conversationId);
  broadcastMessageToConversation(participantIds, {
    conversationId: params.conversationId,
    messageId: params.messageId,
    actorId: params.userId,
    preview: params.pinned ? "Message pinned" : "Message unpinned",
    type: "message:updated",
    message: formatted,
  });

  return formatted;
}

export async function getConversationReceipts(
  conversationId: string,
  currentUserId: string
): Promise<ParticipantReceipt[]> {
  const rows = await prisma.conversationParticipant.findMany({
    where: { conversationId, userId: { not: currentUserId } },
    select: { userId: true, lastReadAt: true, lastReceivedAt: true },
  });
  return rows.map((r) => ({
    userId: r.userId,
    lastReadAt: r.lastReadAt?.toISOString() ?? null,
    lastReceivedAt: r.lastReceivedAt?.toISOString() ?? null,
  }));
}

export async function markConversationRead(conversationId: string, userId: string) {
  const now = new Date();
  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadAt: now, lastReceivedAt: now },
  });
  const participantIds = await getConversationParticipantIds(conversationId);
  broadcastConversationReceipt(participantIds, conversationId, userId, {
    lastReadAt: now.toISOString(),
    lastReceivedAt: now.toISOString(),
  });
}

export async function markConversationReceived(conversationId: string, userId: string) {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { lastReceivedAt: true },
  });
  if (!participant) return;

  const now = new Date();
  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReceivedAt: now },
  });
  const participantIds = await getConversationParticipantIds(conversationId);
  broadcastConversationReceipt(participantIds, conversationId, userId, {
    lastReceivedAt: now.toISOString(),
  });
}

export async function getMessageInConversation(messageId: string, conversationId: string) {
  return prisma.message.findFirst({
    where: { id: messageId, conversationId },
    include: messageInclude,
  });
}
