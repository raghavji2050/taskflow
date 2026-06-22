import type { Prisma } from "@prisma/client";
import { getConversationDisplayName } from "@/lib/conversations";
import type { ScheduledMessageClient } from "@/lib/scheduled-message-types";

export const scheduledMessageInclude = {
  attachments: true,
  conversation: {
    include: {
      workspace: { select: { name: true } },
      participants: { include: { user: { select: { id: true, name: true } } } },
    },
  },
} satisfies Prisma.ScheduledMessageInclude;

type ScheduledMessageRow = Prisma.ScheduledMessageGetPayload<{
  include: typeof scheduledMessageInclude;
}>;

export function formatScheduledMessageForClient(
  row: ScheduledMessageRow,
  viewerId: string
): ScheduledMessageClient {
  return {
    id: row.id,
    body: row.body,
    userId: row.userId,
    conversationId: row.conversationId,
    parentId: row.parentId,
    scheduledFor: row.scheduledFor.toISOString(),
    timezone: row.timezone,
    status: row.status,
    sentAt: row.sentAt?.toISOString() ?? null,
    messageId: row.messageId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    attachments: row.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      url: a.url,
      mimeType: a.mimeType,
      size: a.size,
    })),
    conversationTitle: getConversationDisplayName(row.conversation, viewerId),
    conversationType: row.conversation.type,
  };
}
