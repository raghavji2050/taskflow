import type { Prisma } from "@prisma/client";
import { Prisma as PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { messageInclude, formatMessageForClient } from "@/lib/message-format";
import { getMessageAudience } from "@/lib/message-audience";
import { broadcastMessageToConversation, broadcastConversationReceipt, broadcastConversationCleared } from "@/lib/realtime";
import { getConversationParticipantIds } from "@/lib/chat-access";
import { ensureDirectParticipants } from "@/lib/conversations";
import { attachReceiptStatuses, type ParticipantReceipt } from "@/lib/chat-receipts";
import { notifyParticipants } from "@/lib/message-notify";
import { saveMessageAttachmentFile } from "@/lib/message-upload";
import { normalizeMessageContent } from "@/lib/rich-message-serialize";
import type { RichMessageDoc } from "@/lib/rich-message-types";

export { notifyParticipants };

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
  const formatted = items.reverse().map((m) => formatMessageForClient(m, userId));

  return {
    messages: attachReceiptStatuses(formatted, userId, receipts),
    pinned: attachReceiptStatuses(
      pinned.map((m) => formatMessageForClient(m, userId)),
      userId,
      receipts
    ),
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

  return messages.map((m) => formatMessageForClient(m, userId));
}

const globalMessageInclude = {
  ...messageInclude,
  conversation: {
    include: {
      workspace: { select: { name: true } },
      participants: { include: { user: { select: { id: true, name: true } } } },
    },
  },
} as const;

type GlobalMessageRow = Prisma.MessageGetPayload<{ include: typeof globalMessageInclude }>;

async function getUserParticipations(userId: string) {
  const participations = await prisma.conversationParticipant.findMany({
    where: { userId },
    select: { conversationId: true, clearedAt: true },
  });
  const clearedMap = new Map(
    participations.map((p) => [p.conversationId, p.clearedAt] as const)
  );
  return { participations, clearedMap, convIds: participations.map((p) => p.conversationId) };
}

function messageTextSearchFilter(query: string): Prisma.MessageWhereInput {
  const term = query.trim();
  return {
    OR: [
      { body: { contains: term } },
      { user: { name: { contains: term } } },
      { conversation: { name: { contains: term } } },
      { conversation: { workspace: { name: { contains: term } } } },
      {
        conversation: {
          participants: { some: { user: { name: { contains: term } } } },
        },
      },
    ],
  };
}

function formatGlobalMessageResult(message: GlobalMessageRow, _userId: string) {
  const audience = getMessageAudience(message.conversation, message.userId);
  return {
    ...formatMessageForClient(message),
    conversationId: message.conversationId,
    sender: { id: message.user.id, name: message.user.name },
    audience: {
      kind: audience.kind,
      title: audience.title,
      recipients: audience.recipients,
    },
    sentToLabel: audience.sentToLabel,
  };
}

function filterVisibleMessages(
  rows: GlobalMessageRow[],
  clearedMap: Map<string, Date | null>,
  limit: number
) {
  return rows
    .filter((m) => {
      const cleared = clearedMap.get(m.conversationId);
      return !cleared || m.createdAt > cleared;
    })
    .slice(0, limit)
    .map((m) => m);
}

export async function listRecentMessagesGlobal(userId: string, limit = 15) {
  const { participations, clearedMap, convIds } = await getUserParticipations(userId);
  if (participations.length === 0) return [];

  const rows = await prisma.message.findMany({
    where: {
      conversationId: { in: convIds },
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    take: limit * 3,
    include: globalMessageInclude,
  });

  return filterVisibleMessages(rows, clearedMap, limit).map((m) =>
    formatGlobalMessageResult(m, userId)
  );
}

export async function searchMessagesGlobal(userId: string, query: string, limit = 40) {
  const { participations, clearedMap, convIds } = await getUserParticipations(userId);
  if (participations.length === 0) return [];

  const rows = await prisma.message.findMany({
    where: {
      conversationId: { in: convIds },
      deletedAt: null,
      ...messageTextSearchFilter(query),
    },
    orderBy: { createdAt: "desc" },
    take: limit * 3,
    include: globalMessageInclude,
  });

  return filterVisibleMessages(rows, clearedMap, limit).map((m) =>
    formatGlobalMessageResult(m, userId)
  );
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
    messages: messages.map((m) => formatMessageForClient(m, userId)),
    date: dateKey,
    hasMoreBefore: hasMoreBefore > 0,
    hasMoreAfter: hasMoreAfter > 0,
  };
}

export async function clearConversationForUser(conversationId: string, userId: string) {
  const clearedAt = new Date();
  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { clearedAt, lastReadAt: clearedAt },
  });
  broadcastConversationCleared(userId, conversationId, clearedAt);
}

export async function sendMessage(params: {
  conversationId: string;
  userId: string;
  userName: string;
  body: string;
  bodyJson?: RichMessageDoc | null;
  parentId?: string | null;
  conversationTitle: string;
  mentionCandidates: { id: string; name: string }[];
  skipNotify?: boolean;
}) {
  const {
    conversationId,
    userId,
    userName,
    body,
    bodyJson,
    parentId,
    conversationTitle,
    mentionCandidates,
    skipNotify,
  } = params;

  const normalized = normalizeMessageContent({ body, bodyJson });
  const trimmed = normalized.body.trim();
  if (!trimmed) {
    throw new Error("Message cannot be empty");
  }

  await ensureDirectParticipants(conversationId, userId);

  const message = await prisma.message.create({
    data: {
      conversationId,
      userId,
      body: trimmed,
      bodyJson: normalized.bodyJson ?? undefined,
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

  if (!skipNotify) {
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
  }

  return formatted;
}

export async function sendDocumentShareMessage(params: {
  conversationId: string;
  userId: string;
  userName: string;
  body: string;
  documentId: string;
  conversationTitle: string;
  mentionCandidates: { id: string; name: string }[];
}) {
  const { conversationId, userId, userName, body, documentId, conversationTitle, mentionCandidates } =
    params;

  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error("Message cannot be empty");
  }

  await ensureDirectParticipants(conversationId, userId);

  const created = await prisma.message.create({
    data: {
      conversationId,
      userId,
      body: trimmed,
    },
  });

  await prisma.documentMessage.create({
    data: { documentId, messageId: created.id },
  });

  const message = await prisma.message.findUniqueOrThrow({
    where: { id: created.id },
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
  });

  return formatted;
}

export async function forwardMessage(params: {
  sourceMessageId: string;
  targetConversationId: string;
  userId: string;
  userName: string;
  body?: string;
  bodyJson?: RichMessageDoc | null;
  conversationTitle: string;
  mentionCandidates: { id: string; name: string }[];
}) {
  const {
    sourceMessageId,
    targetConversationId,
    userId,
    userName,
    body = "",
    bodyJson,
    conversationTitle,
    mentionCandidates,
  } = params;

  const source = await prisma.message.findUnique({
    where: { id: sourceMessageId },
    include: messageInclude,
  });
  if (!source) throw new Error("Message not found");

  const normalized = normalizeMessageContent({
    body,
    bodyJson: bodyJson ?? (body.trim() ? null : (source.bodyJson as RichMessageDoc | null)),
  });
  const comment = normalized.body.trim();

  await ensureDirectParticipants(targetConversationId, userId);

  const created = await prisma.message.create({
    data: {
      conversationId: targetConversationId,
      userId,
      body: comment,
      bodyJson:
        normalized.bodyJson === null
          ? PrismaClient.DbNull
          : (normalized.bodyJson as Prisma.InputJsonValue),
      forwardedFromId: source.id,
    },
  });

  if (source.attachments.length > 0) {
    await prisma.messageAttachment.createMany({
      data: source.attachments.map((a) => ({
        messageId: created.id,
        filename: a.filename,
        url: a.url,
        mimeType: a.mimeType,
        size: a.size,
      })),
    });
  }

  if (source.documentLinks.length > 0) {
    await prisma.documentMessage.createMany({
      data: source.documentLinks.map((link) => ({
        documentId: link.documentId,
        messageId: created.id,
      })),
      skipDuplicates: true,
    });
  }

  const message = await prisma.message.findUniqueOrThrow({
    where: { id: created.id },
    include: messageInclude,
  });

  await prisma.conversation.update({
    where: { id: targetConversationId },
    data: { updatedAt: new Date() },
  });

  await prisma.conversationParticipant.updateMany({
    where: { conversationId: targetConversationId },
    data: { archivedAt: null },
  });

  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId: targetConversationId, userId } },
    data: { lastReadAt: new Date() },
  });

  const sourcePreview = source.deletedAt
    ? "Forwarded a message"
    : source.body.trim().slice(0, 80) || "Forwarded a message";
  const preview = comment || sourcePreview;
  const formatted = formatMessageForClient(message, userId);

  await notifyParticipants({
    conversationId: targetConversationId,
    userId,
    userName,
    preview: preview.length > 80 ? `${preview.slice(0, 80)}…` : preview,
    conversationTitle,
    mentionCandidates,
    body: comment || sourcePreview,
    messageId: message.id,
    message: formatted,
  });

  return formatted;
}

export async function updateMessage(params: {
  messageId: string;
  conversationId: string;
  userId: string;
  body: string;
  bodyJson?: RichMessageDoc | null;
}) {
  const msg = await prisma.message.findFirst({
    where: { id: params.messageId, conversationId: params.conversationId },
  });
  if (!msg) throw new Error("Message not found");
  if (msg.userId !== params.userId) throw new Error("Forbidden");
  if (msg.deletedAt) throw new Error("Cannot edit a deleted message");

  const normalized = normalizeMessageContent({
    body: params.body,
    bodyJson: params.bodyJson,
  });
  const trimmed = normalized.body.trim();
  if (!trimmed) throw new Error("Message cannot be empty");

  const message = await prisma.message.update({
    where: { id: params.messageId },
    data: {
      body: trimmed,
      bodyJson:
        normalized.bodyJson === null
          ? PrismaClient.DbNull
          : (normalized.bodyJson as Prisma.InputJsonValue),
      editedAt: new Date(),
    },
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
  const saved = await saveMessageAttachmentFile(params.userId, params.file);

  const attachment = await prisma.messageAttachment.create({
    data: {
      messageId: params.messageId,
      filename: saved.filename,
      url: saved.url,
      mimeType: saved.mimeType,
      size: saved.size,
    },
  });

  const message = await prisma.message.findUniqueOrThrow({
    where: { id: params.messageId },
    include: messageInclude,
  });

  return { attachment, message: formatMessageForClient(message) };
}

export async function addMessageAttachments(params: {
  messageId: string;
  userId: string;
  files: File[];
}) {
  await Promise.all(
    params.files.map(async (file) => {
      const saved = await saveMessageAttachmentFile(params.userId, file);
      await prisma.messageAttachment.create({
        data: {
          messageId: params.messageId,
          filename: saved.filename,
          url: saved.url,
          mimeType: saved.mimeType,
          size: saved.size,
        },
      });
    })
  );

  const message = await prisma.message.findUniqueOrThrow({
    where: { id: params.messageId },
    include: messageInclude,
  });

  return formatMessageForClient(message);
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
