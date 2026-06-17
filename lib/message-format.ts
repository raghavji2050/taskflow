import { getConversationDisplayName } from "@/lib/conversations";
import { formatMomPreviewFromRecord } from "@/lib/mom-format";

export const messageUserSelect = { id: true, name: true, image: true } as const;

const forwardedFromSelect = {
  id: true,
  body: true,
  deletedAt: true,
  createdAt: true,
  user: { select: { id: true, name: true } },
  attachments: true,
  documentLinks: {
    take: 1,
    include: {
      document: {
        select: {
          id: true,
          title: true,
          type: true,
          icon: true,
          meetingMinutes: {
            select: {
              id: true,
              documentId: true,
              title: true,
              startedAt: true,
              endedAt: true,
              points: true,
              content: true,
              attendeeUserIds: true,
              allAttendees: true,
            },
          },
        },
      },
    },
  },
  conversation: {
    select: {
      type: true,
      name: true,
      workspace: { select: { name: true } },
      participants: { select: { user: { select: { id: true, name: true } } } },
    },
  },
} as const;

export const messageInclude = {
  user: { select: messageUserSelect },
  parent: {
    select: {
      id: true,
      body: true,
      deletedAt: true,
      createdAt: true,
      user: { select: { id: true, name: true } },
    },
  },
  forwardedFrom: { select: forwardedFromSelect },
  attachments: true,
  reactions: {
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  documentLinks: {
    take: 1,
    include: {
      document: {
        select: {
          id: true,
          title: true,
          type: true,
          icon: true,
          meetingMinutes: {
            select: {
              id: true,
              documentId: true,
              title: true,
              startedAt: true,
              endedAt: true,
              points: true,
              content: true,
              attendeeUserIds: true,
              allAttendees: true,
            },
          },
        },
      },
    },
  },
  conversation: {
    select: {
      type: true,
      participants: { select: { user: { select: { id: true, name: true } } } },
    },
  },
};

type ForwardedFromSource = {
  id: string;
  body: string;
  deletedAt?: Date | null;
  createdAt: Date;
  user: { id: string; name: string };
  attachments?: { id: string; filename: string; url: string; mimeType: string; size: number }[];
  documentLinks?: {
    document: {
      id: string;
      title: string;
      type: string;
      icon: string | null;
      meetingMinutes?: {
        id: string;
        documentId: string;
        title: string;
        startedAt: Date;
        endedAt: Date | null;
        points: import("@prisma/client").Prisma.JsonValue;
        content?: import("@prisma/client").Prisma.JsonValue | null;
        attendeeUserIds: import("@prisma/client").Prisma.JsonValue;
        allAttendees: boolean;
      } | null;
    };
  }[];
  conversation: {
    type: import("@prisma/client").ConversationType;
    name: string | null;
    workspace?: { name: string } | null;
    participants: { user: { id: string; name: string } }[];
  };
};

type MessageWithRelations = {
  id: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  pinnedAt: Date | null;
  editedAt?: Date | null;
  deletedAt?: Date | null;
  user: { id: string; name: string; image?: string | null };
  parent?: {
    id: string;
    body: string;
    deletedAt?: Date | null;
    createdAt: Date;
    user: { id: string; name: string };
  } | null;
  forwardedFrom?: ForwardedFromSource | null;
  attachments?: { id: string; filename: string; url: string; mimeType: string; size: number }[];
  reactions?: { id: string; emoji: string; user: { id: string; name: string } }[];
  documentLinks?: {
    document: {
      id: string;
      title: string;
      type: string;
      icon: string | null;
      meetingMinutes?: {
        id: string;
        documentId: string;
        title: string;
        startedAt: Date;
        endedAt: Date | null;
        points: import("@prisma/client").Prisma.JsonValue;
        content?: import("@prisma/client").Prisma.JsonValue | null;
        attendeeUserIds: import("@prisma/client").Prisma.JsonValue;
        allAttendees: boolean;
      } | null;
    };
  }[];
  conversation?: {
    type: import("@prisma/client").ConversationType;
    participants: { user: { id: string; name: string } }[];
  };
};

function formatSharedDocument(
  documentLinks?: { document: { id: string; title: string; type: string; icon: string | null } }[]
) {
  const doc = documentLinks?.[0]?.document;
  if (!doc) return null;
  return {
    id: doc.id,
    title: doc.title,
    type: doc.type,
    icon: doc.icon,
  };
}

function formatForwardedFrom(source: ForwardedFromSource, viewerUserId?: string) {
  const deleted = Boolean(source.deletedAt);
  const sourceLabel = viewerUserId
    ? getConversationDisplayName(source.conversation, viewerUserId)
    : source.conversation.name ?? "Chat";

  return {
    id: source.id,
    body: deleted ? "" : source.body,
    deleted,
    createdAt: source.createdAt.toISOString(),
    user: source.user,
    attachments: deleted ? [] : (source.attachments ?? []),
    sharedDocument: deleted ? null : formatSharedDocument(source.documentLinks),
    sourceLabel,
  };
}

export type FormattedForwardedFrom = ReturnType<typeof formatForwardedFrom>;

export function formatMessageForClient(message: MessageWithRelations, viewerUserId?: string) {
  const deleted = Boolean(message.deletedAt);
  return {
    id: message.id,
    body: deleted ? "" : message.body,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    pinnedAt: message.pinnedAt?.toISOString() ?? null,
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    user: message.user,
    parent: message.parent
      ? {
          id: message.parent.id,
          body: message.parent.deletedAt ? "" : message.parent.body,
          deleted: Boolean(message.parent.deletedAt),
          createdAt: message.parent.createdAt.toISOString(),
          user: message.parent.user,
        }
      : null,
    forwardedFrom:
      !deleted && message.forwardedFrom
        ? formatForwardedFrom(message.forwardedFrom, viewerUserId)
        : null,
    attachments: deleted ? [] : (message.attachments ?? []),
    reactions: message.reactions ?? [],
    sharedMom:
      deleted || !message.documentLinks?.[0]?.document?.meetingMinutes
        ? null
        : formatMomPreviewFromRecord(message.documentLinks[0].document.meetingMinutes, {
            conversationType: message.conversation?.type,
            participants: message.conversation?.participants.map((p) => p.user),
          }),
    sharedDocument: deleted
      ? null
      : message.documentLinks?.[0]?.document?.meetingMinutes
        ? null
        : message.documentLinks?.[0]?.document
          ? formatSharedDocument(message.documentLinks)
          : null,
  };
}
