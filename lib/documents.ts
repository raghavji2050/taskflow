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

/** List rows omit `body` (LongText). Detail routes still return it. */
export const documentListSelect = {
  id: true,
  title: true,
  type: true,
  icon: true,
  userId: true,
  workspaceId: true,
  parentId: true,
  position: true,
  pinned: true,
  archived: true,
  createdAt: true,
  updatedAt: true,
  ...documentListInclude,
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
  meetingMinutes: { select: { id: true } },
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

export async function getDocumentLinkContext(userId: string, documentId: string) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId },
    select: { userId: true, workspaceId: true },
  });
  if (!doc) return { canEdit: false, workspaceId: null };
  if (!doc.workspaceId) {
    return { canEdit: doc.userId === userId, workspaceId: null };
  }
  const membership = await getWorkspaceMembership(userId, doc.workspaceId);
  return { canEdit: canEditWorkspaceTasks(membership), workspaceId: doc.workspaceId };
}

export async function canEditDocument(userId: string, documentId: string) {
  const ctx = await getDocumentLinkContext(userId, documentId);
  return ctx.canEdit;
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

export async function linkDocumentToTasks(
  userId: string,
  documentId: string,
  taskIds: string[],
  preloaded?: { canEdit: boolean; workspaceId: string | null }
) {
  const unique = [...new Set(taskIds)];
  if (unique.length === 0) return [];

  const ctx = preloaded ?? (await getDocumentLinkContext(userId, documentId));
  if (!ctx.canEdit) return [];

  const tasks = await prisma.task.findMany({
    where: {
      id: { in: unique },
      OR: [
        { userId },
        { assignees: { some: { userId } } },
        { workspace: { members: { some: { userId } } } },
      ],
    },
    select: { id: true, workspaceId: true },
  });

  const linkable = tasks.filter((task) => {
    if (ctx.workspaceId && task.workspaceId !== ctx.workspaceId) return false;
    if (!ctx.workspaceId && task.workspaceId) return false;
    return true;
  });
  if (linkable.length === 0) return [];

  await prisma.documentTask.createMany({
    data: linkable.map((task) => ({ documentId, taskId: task.id })),
    skipDuplicates: true,
  });
  return linkable.map((task) => task.id);
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
