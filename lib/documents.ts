import { prisma } from "@/lib/prisma";
import { serializeLinkedMessage } from "@/lib/message-audience";
import { canAccessTask, canEditWorkspaceTasks, getWorkspaceMembership } from "@/lib/workspace";

export const documentListInclude = {
  user: { select: { id: true, name: true } },
  _count: {
    select: {
      versions: true,
      comments: true,
      taskLinks: true,
      messageLinks: true,
      children: true,
      attachments: true,
    },
  },
} as const;

export const documentAttachmentSelect = {
  id: true,
  filename: true,
  url: true,
  mimeType: true,
  size: true,
  createdAt: true,
  user: { select: { id: true, name: true } },
} as const;

export const documentDetailInclude = {
  user: { select: { id: true, name: true } },
  attachments: {
    orderBy: { createdAt: "desc" as const },
    select: documentAttachmentSelect,
  },
  versions: {
    orderBy: { versionNumber: "desc" as const },
    take: 1,
    select: { id: true, versionNumber: true, createdAt: true },
  },
  taskLinks: {
    include: {
      task: {
        select: { id: true, title: true, status: true, workspaceId: true },
      },
    },
  },
  messageLinks: {
    include: {
      message: {
        select: {
          id: true,
          body: true,
          createdAt: true,
          userId: true,
          user: { select: { id: true, name: true } },
          conversation: {
            select: {
              type: true,
              name: true,
              workspace: { select: { name: true } },
              participants: {
                select: { user: { select: { id: true, name: true } } },
              },
            },
          },
        },
      },
    },
  },
  _count: {
    select: { versions: true, comments: true, attachments: true },
  },
} as const;

export async function canAccessDocument(userId: string, documentId: string) {
  const direct = await prisma.document.findFirst({
    where: {
      id: documentId,
      OR: [
        { userId, workspaceId: null },
        { workspace: { members: { some: { userId } } } },
      ],
    },
  });
  if (direct) return direct;

  return prisma.document.findFirst({
    where: {
      id: documentId,
      messageLinks: {
        some: {
          message: {
            conversation: {
              participants: { some: { userId } },
            },
          },
        },
      },
    },
  });
}

export async function canEditDocument(userId: string, documentId: string) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId },
    select: { userId: true, workspaceId: true },
  });
  if (!doc) return false;
  if (!doc.workspaceId) return doc.userId === userId;
  const membership = await getWorkspaceMembership(userId, doc.workspaceId);
  return canEditWorkspaceTasks(membership);
}

export async function canAccessMessage(userId: string, messageId: string) {
  const message = await prisma.message.findFirst({
    where: {
      id: messageId,
      deletedAt: null,
      conversation: {
        participants: { some: { userId } },
      },
    },
  });
  return !!message;
}

export async function createDocumentVersion(params: {
  documentId: string;
  userId: string;
  title: string;
  body: string;
  changeNote?: string | null;
}) {
  const max = await prisma.documentVersion.aggregate({
    where: { documentId: params.documentId },
    _max: { versionNumber: true },
  });
  const versionNumber = (max._max.versionNumber ?? 0) + 1;

  return prisma.documentVersion.create({
    data: {
      documentId: params.documentId,
      versionNumber,
      title: params.title,
      body: params.body,
      changeNote: params.changeNote ?? null,
      userId: params.userId,
    },
  });
}

export async function linkDocumentToTask(
  userId: string,
  documentId: string,
  taskId: string
) {
  if (!(await canEditDocument(userId, documentId))) return null;
  const task = await canAccessTask(userId, taskId);
  if (!task) return null;

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { workspaceId: true },
  });
  if (doc?.workspaceId && task.workspaceId !== doc.workspaceId) return null;
  if (!doc?.workspaceId && task.workspaceId) return null;

  return prisma.documentTask.upsert({
    where: { documentId_taskId: { documentId, taskId } },
    update: {},
    create: { documentId, taskId },
  });
}

export async function linkDocumentToMessage(
  userId: string,
  documentId: string,
  messageId: string
) {
  if (!(await canEditDocument(userId, documentId))) return null;
  if (!(await canAccessMessage(userId, messageId))) return null;

  return prisma.documentMessage.upsert({
    where: { documentId_messageId: { documentId, messageId } },
    update: {},
    create: { documentId, messageId },
  });
}

export async function getDocumentsForTask(userId: string, taskId: string) {
  const task = await canAccessTask(userId, taskId);
  if (!task) return [];

  return prisma.document.findMany({
    where: {
      taskLinks: { some: { taskId } },
      OR: [
        { userId, workspaceId: null },
        { workspace: { members: { some: { userId } } } },
      ],
    },
    select: {
      id: true,
      title: true,
      type: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });
}

type DocumentDetailRow = {
  messageLinks: {
    message: Parameters<typeof serializeLinkedMessage>[0];
  }[];
} & Record<string, unknown>;

export function serializeDocumentDetail<T extends DocumentDetailRow>(document: T) {
  return {
    ...document,
    messageLinks: document.messageLinks.map((link) => ({
      message: serializeLinkedMessage(link.message),
    })),
  };
}
