export const messageUserSelect = { id: true, name: true, image: true } as const;

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
  attachments: true,
  reactions: {
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
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
  attachments?: { id: string; filename: string; url: string; mimeType: string; size: number }[];
  reactions?: { id: string; emoji: string; user: { id: string; name: string } }[];
};

export function formatMessageForClient(message: MessageWithRelations) {
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
    attachments: deleted ? [] : (message.attachments ?? []),
    reactions: message.reactions ?? [],
  };
}
