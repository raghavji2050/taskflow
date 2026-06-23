import { ConversationType, WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getWorkspaceMembershipIncludingArchived } from "@/lib/workspace";
import { broadcastConversationRemoved } from "@/lib/realtime";

const conversationInclude = {
  workspace: { select: { id: true, name: true } },
  participants: {
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
  },
  messages: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    include: { user: { select: { id: true, name: true } } },
  },
};

const dmUserSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  lastSeenAt: true,
} as const;

/** Include peers who left/deleted the DM so names and avatars still resolve. */
async function getDirectParticipantUsers(conversationId: string) {
  const active = await prisma.conversationParticipant.findMany({
    where: { conversationId },
    include: { user: { select: dmUserSelect } },
  });

  const byId = new Map(active.map((p) => [p.user.id, p.user]));

  if (byId.size < 2) {
    const messageAuthors = await prisma.message.findMany({
      where: { conversationId },
      distinct: ["userId"],
      select: { user: { select: dmUserSelect } },
    });
    for (const { user } of messageAuthors) {
      if (!byId.has(user.id)) byId.set(user.id, user);
    }
  }

  return Array.from(byId.values());
}

/** Members eligible for @mentions (participants + workspace members for team channels). */
export async function getMentionCandidatesForConversation(conversation: {
  id: string;
  type: ConversationType;
  workspaceId: string | null;
  participants: { user: { id: string; name: string } }[];
}): Promise<{ id: string; name: string }[]> {
  const byId = new Map<string, { id: string; name: string }>();

  for (const p of conversation.participants) {
    byId.set(p.user.id, { id: p.user.id, name: p.user.name });
  }

  if (conversation.type === ConversationType.WORKSPACE && conversation.workspaceId) {
    const wsMembers = await prisma.workspaceMember.findMany({
      where: { workspaceId: conversation.workspaceId },
      select: { user: { select: { id: true, name: true } } },
    });
    for (const { user } of wsMembers) {
      if (!byId.has(user.id)) byId.set(user.id, user);
    }
  }

  if (conversation.type === ConversationType.DIRECT) {
    const directUsers = await getDirectParticipantUsers(conversation.id);
    for (const user of directUsers) {
      if (!byId.has(user.id)) {
        byId.set(user.id, { id: user.id, name: user.name });
      }
    }
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function findDirectConversation(userId1: string, userId2: string) {
  const conversations = await prisma.conversation.findMany({
    where: {
      type: ConversationType.DIRECT,
      AND: [
        {
          OR: [
            { participants: { some: { userId: userId1 } } },
            { messages: { some: { userId: userId1 } } },
          ],
        },
        {
          OR: [
            { participants: { some: { userId: userId2 } } },
            { messages: { some: { userId: userId2 } } },
          ],
        },
      ],
    },
    include: { participants: { select: { userId: true } } },
  });

  return conversations[0] ?? null;
}

export async function createDirectConversation(creatorId: string, otherUserId: string) {
  if (creatorId === otherUserId) {
    throw new Error("Cannot create a conversation with yourself");
  }

  const other = await prisma.user.findUnique({ where: { id: otherUserId } });
  if (!other) throw new Error("User not found");

  const existing = await findDirectConversation(creatorId, otherUserId);
  if (existing) {
    await ensureDirectParticipants(existing.id, creatorId);
    return prisma.conversation.findUniqueOrThrow({
      where: { id: existing.id },
      include: conversationInclude,
    });
  }

  return prisma.conversation.create({
    data: {
      type: ConversationType.DIRECT,
      createdById: creatorId,
      participants: {
        create: [{ userId: creatorId }, { userId: otherUserId }],
      },
    },
    include: conversationInclude,
  });
}

export async function findPersonalConversation(userId: string) {
  const conversations = await prisma.conversation.findMany({
    where: {
      type: ConversationType.PERSONAL,
      participants: { some: { userId } },
    },
    include: { participants: { select: { userId: true } } },
  });

  return (
    conversations.find(
      (c) => c.participants.length === 1 && c.participants[0]?.userId === userId
    ) ?? null
  );
}

export async function ensurePersonalConversation(userId: string) {
  const existing = await findPersonalConversation(userId);
  if (existing) {
    return prisma.conversation.findUniqueOrThrow({
      where: { id: existing.id },
      include: conversationInclude,
    });
  }

  return prisma.conversation.create({
    data: {
      type: ConversationType.PERSONAL,
      createdById: userId,
      participants: { create: { userId } },
    },
    include: conversationInclude,
  });
}

export async function createGroupConversation(
  creatorId: string,
  memberIds: string[],
  name?: string | null
) {
  const uniqueIds = [...new Set([creatorId, ...memberIds])];
  if (uniqueIds.length < 2) {
    throw new Error("Group chat requires at least 2 members");
  }

  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true },
  });
  if (users.length !== uniqueIds.length) {
    throw new Error("One or more members not found");
  }

  return prisma.conversation.create({
    data: {
      type: ConversationType.GROUP,
      name: name?.trim() || null,
      createdById: creatorId,
      participants: {
        create: uniqueIds.map((userId) => ({ userId })),
      },
    },
    include: conversationInclude,
  });
}

export async function ensureWorkspaceChannel(workspaceId: string, creatorId: string) {
  const existing = await prisma.conversation.findUnique({
    where: { workspaceId },
    include: conversationInclude,
  });
  if (existing) {
    await syncWorkspaceChannelParticipants(workspaceId);
    return prisma.conversation.findUniqueOrThrow({
      where: { id: existing.id },
      include: conversationInclude,
    });
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: { members: { select: { userId: true } } },
  });
  if (!workspace) return null;

  return prisma.conversation.create({
    data: {
      type: ConversationType.WORKSPACE,
      workspaceId,
      createdById: creatorId,
      participants: {
        create: workspace.members.map((m) => ({ userId: m.userId })),
      },
    },
    include: conversationInclude,
  });
}

export async function syncWorkspaceChannelParticipants(workspaceId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { workspaceId },
    select: { id: true },
  });
  if (!conversation) return;

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    select: { userId: true },
  });
  const memberIds = new Set(members.map((m) => m.userId));

  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId: conversation.id },
    select: { id: true, userId: true },
  });

  const toRemove = participants.filter((p) => !memberIds.has(p.userId));
  const existingIds = new Set(participants.map((p) => p.userId));
  const toAdd = [...memberIds].filter((id) => !existingIds.has(id));

  await prisma.$transaction([
    ...toRemove.map((p) =>
      prisma.conversationParticipant.delete({ where: { id: p.id } })
    ),
    ...toAdd.map((userId) =>
      prisma.conversationParticipant.create({
        data: { conversationId: conversation.id, userId },
      })
    ),
  ]);
}

export async function createWorkspaceChannelOnCreate(workspaceId: string, ownerId: string) {
  const existing = await prisma.conversation.findUnique({ where: { workspaceId } });
  if (existing) return existing;

  return prisma.conversation.create({
    data: {
      type: ConversationType.WORKSPACE,
      workspaceId,
      createdById: ownerId,
      participants: { create: { userId: ownerId } },
    },
  });
}

export async function addUserToWorkspaceChannel(workspaceId: string, userId: string) {
  const conversation = await prisma.conversation.findUnique({ where: { workspaceId } });
  if (!conversation) return;

  await prisma.conversationParticipant.upsert({
    where: {
      conversationId_userId: { conversationId: conversation.id, userId },
    },
    create: { conversationId: conversation.id, userId },
    update: {},
  });
}

export async function removeUserFromWorkspaceChannel(workspaceId: string, userId: string) {
  const conversation = await prisma.conversation.findUnique({ where: { workspaceId } });
  if (!conversation) return;

  await prisma.conversationParticipant.deleteMany({
    where: { conversationId: conversation.id, userId },
  });
}

async function userCanPost(
  userId: string,
  conversation: { type: ConversationType; workspaceId: string | null }
) {
  if (conversation.type === ConversationType.WORKSPACE && conversation.workspaceId) {
    const membership = await getWorkspaceMembershipIncludingArchived(
      userId,
      conversation.workspaceId
    );
    return (
      !!membership &&
      membership.role !== WorkspaceRole.VIEWER &&
      !membership.workspace.archivedAt
    );
  }
  return true;
}

function readSince(lastReadAt: Date | null, clearedAt: Date | null) {
  const times = [lastReadAt, clearedAt].filter((d): d is Date => d !== null);
  if (times.length === 0) return null;
  return new Date(Math.max(...times.map((d) => d.getTime())));
}

async function getUnreadCount(
  conversationId: string,
  userId: string,
  lastReadAt: Date | null,
  clearedAt: Date | null = null
) {
  const since = readSince(lastReadAt, clearedAt);
  return prisma.message.count({
    where: {
      conversationId,
      deletedAt: null,
      userId: { not: userId },
      ...(since ? { createdAt: { gt: since } } : {}),
    },
  });
}

export async function getConversationUnreadCount(conversationId: string, userId: string) {
  const row = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { lastReadAt: true, clearedAt: true },
  });
  return getUnreadCount(conversationId, userId, row?.lastReadAt ?? null, row?.clearedAt ?? null);
}

async function getLastVisibleMessage(conversationId: string, clearedAt: Date | null) {
  return prisma.message.findFirst({
    where: {
      conversationId,
      deletedAt: null,
      ...afterCleared(clearedAt),
    },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, name: true } } },
  });
}

function afterCleared(clearedAt: Date | null) {
  return clearedAt ? { createdAt: { gt: clearedAt } } : {};
}

/** DM initiator sees the chat immediately; the other person only after a message from the peer. */
export async function isDirectConversationVisible(
  userId: string,
  conversation: { id: string; createdById: string; type: ConversationType }
) {
  if (conversation.type !== ConversationType.DIRECT) return true;
  if (conversation.createdById === userId) return true;

  const fromPeer = await prisma.message.findFirst({
    where: {
      conversationId: conversation.id,
      deletedAt: null,
      userId: { not: userId },
    },
    select: { id: true },
  });
  return !!fromPeer;
}

export function getConversationDisplayName(
  conversation: {
    type: ConversationType;
    name: string | null;
    workspace?: { name: string } | null;
    participants: { user: { id: string; name: string } }[];
  },
  currentUserId: string
) {
  if (conversation.type === ConversationType.WORKSPACE) {
    return conversation.workspace?.name ?? "Team channel";
  }
  if (conversation.type === ConversationType.PERSONAL) {
    return "Personal";
  }
  if (conversation.type === ConversationType.GROUP) {
    return conversation.name ?? "Group chat";
  }
  const other = conversation.participants.find((p) => p.user.id !== currentUserId);
  return other?.user.name ?? "Direct message";
}

export async function listUserConversations(userId: string) {
  const rows = await prisma.conversationParticipant.findMany({
    where: { userId },
    include: {
      conversation: {
        include: {
          workspace: { select: { id: true, name: true } },
          participants: {
            include: { user: { select: { id: true, name: true, email: true, image: true, lastSeenAt: true } } },
          },
        },
      },
    },
  });

  const enriched = await Promise.all(
    rows.map(async (row) => {
      const visible = await isDirectConversationVisible(userId, row.conversation);
      if (!visible) return null;

      const clearedAt = row.clearedAt ?? null;
      const [unreadCount, lastMsg] = await Promise.all([
        getUnreadCount(row.conversationId, userId, row.lastReadAt, clearedAt),
        getLastVisibleMessage(row.conversationId, clearedAt),
      ]);

      const participants =
        row.conversation.type === ConversationType.DIRECT
          ? await getDirectParticipantUsers(row.conversationId)
          : row.conversation.participants.map((p) => p.user);

      const conversationForName = {
        ...row.conversation,
        participants: participants.map((user) => ({ user })),
      };

      return {
        id: row.conversation.id,
        type: row.conversation.type,
        name: getConversationDisplayName(conversationForName, userId),
        rawName: row.conversation.name,
        workspaceId: row.conversation.workspaceId,
        workspace: row.conversation.workspace,
        participants,
        lastMessage: lastMsg
          ? {
              id: lastMsg.id,
              body: lastMsg.body,
              createdAt: lastMsg.createdAt.toISOString(),
              user: lastMsg.user,
            }
          : null,
        unreadCount,
        canPost: await userCanPost(userId, row.conversation),
        archivedAt: row.archivedAt?.toISOString() ?? null,
        clearedAt: clearedAt?.toISOString() ?? null,
        updatedAt: row.conversation.updatedAt.toISOString(),
      };
    })
  );

  const conversations = enriched.filter((c): c is NonNullable<typeof c> => c !== null);

  conversations.sort((a, b) => {
    const aTime = a.lastMessage?.createdAt ?? a.clearedAt ?? a.updatedAt;
    const bTime = b.lastMessage?.createdAt ?? b.clearedAt ?? b.updatedAt;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  return { conversations, totalUnread };
}

export async function getTotalUnreadCount(userId: string) {
  const participants = await prisma.conversationParticipant.findMany({
    where: { userId },
    select: {
      conversationId: true,
      lastReadAt: true,
      clearedAt: true,
      conversation: { select: { id: true, type: true, createdById: true } },
    },
  });

  let total = 0;
  for (const p of participants) {
    const visible = await isDirectConversationVisible(userId, p.conversation);
    if (!visible) continue;
    total += await getUnreadCount(p.conversationId, userId, p.lastReadAt, p.clearedAt);
  }
  return total;
}

export async function getConversationById(conversationId: string, userId: string) {
  const row = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    include: {
      conversation: {
        include: {
          workspace: { select: { id: true, name: true } },
          participants: {
            include: { user: { select: { id: true, name: true, email: true, image: true, lastSeenAt: true } } },
          },
        },
      },
    },
  });
  if (!row) return null;

  const visible = await isDirectConversationVisible(userId, row.conversation);
  if (!visible) return null;

  const participants =
    row.conversation.type === ConversationType.DIRECT
      ? await getDirectParticipantUsers(conversationId)
      : row.conversation.participants.map((p) => p.user);

  const conversationForName = {
    ...row.conversation,
    participants: participants.map((user) => ({ user })),
  };

  const unreadCount = await getUnreadCount(conversationId, userId, row.lastReadAt);
  return {
    id: row.conversation.id,
    type: row.conversation.type,
    name: getConversationDisplayName(conversationForName, userId),
    rawName: row.conversation.name,
    workspaceId: row.conversation.workspaceId,
    workspace: row.conversation.workspace,
    participants,
    unreadCount,
    canPost: await userCanPost(userId, row.conversation),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    updatedAt: row.conversation.updatedAt.toISOString(),
  };
}

export async function deleteConversationForUser(userId: string, conversationId: string) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      type: true,
      participants: { select: { userId: true } },
    },
  });
  if (!conv) throw new Error("Conversation not found");
  if (!conv.participants.some((p) => p.userId === userId)) {
    throw new Error("Not a participant");
  }

  if (
    conv.type === ConversationType.WORKSPACE ||
    conv.type === ConversationType.PERSONAL
  ) {
    throw new Error("This conversation cannot be deleted");
  }

  if (conv.type === ConversationType.DIRECT) {
    await prisma.conversationParticipant.delete({
      where: { conversationId_userId: { conversationId, userId } },
    });
    const remaining = await prisma.conversationParticipant.count({ where: { conversationId } });
    broadcastConversationRemoved(userId, conversationId);
    if (remaining === 0) {
      await prisma.conversation.delete({ where: { id: conversationId } });
      return { deleted: true as const };
    }
    return { deleted: false as const, left: true as const };
  }

  if (conv.participants.length <= 1) {
    await prisma.conversation.delete({ where: { id: conversationId } });
    broadcastConversationRemoved(userId, conversationId);
    return { deleted: true as const };
  }

  await prisma.conversationParticipant.delete({
    where: { conversationId_userId: { conversationId, userId } },
  });
  broadcastConversationRemoved(userId, conversationId);
  return { deleted: false as const, left: true as const };
}

/** Re-add users who deleted a DM when the other party sends a new message. */
export async function ensureDirectParticipants(conversationId: string, senderId: string) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { type: true, participants: { select: { userId: true } } },
  });
  if (!conv || conv.type !== ConversationType.DIRECT) return;

  const activeIds = new Set(conv.participants.map((p) => p.userId));
  const pastSenders = await prisma.message.findMany({
    where: { conversationId },
    distinct: ["userId"],
    select: { userId: true },
  });

  const dmUserIds = new Set(pastSenders.map((m) => m.userId));
  dmUserIds.add(senderId);

  for (const uid of dmUserIds) {
    if (!activeIds.has(uid)) {
      await prisma.conversationParticipant.create({
        data: { conversationId, userId: uid },
      });
    }
  }
}

export async function renameGroupConversation(
  conversationId: string,
  userId: string,
  name: string
) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { type: true, createdById: true },
  });
  if (!conv || conv.type !== ConversationType.GROUP) {
    throw new Error("Not a group conversation");
  }
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!participant) throw new Error("Not a participant");

  return prisma.conversation.update({
    where: { id: conversationId },
    data: { name: name.trim() || null },
  });
}

export async function addGroupMembers(
  conversationId: string,
  actorId: string,
  memberIds: string[]
) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { type: true },
  });
  if (!conv || conv.type !== ConversationType.GROUP) {
    throw new Error("Not a group conversation");
  }
  const actor = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: actorId } },
  });
  if (!actor) throw new Error("Not a participant");

  const unique = [...new Set(memberIds.filter((id) => id !== actorId))];
  for (const memberId of unique) {
    await prisma.conversationParticipant.upsert({
      where: { conversationId_userId: { conversationId, userId: memberId } },
      create: { conversationId, userId: memberId },
      update: {},
    });
  }
}

export async function leaveGroupConversation(conversationId: string, userId: string) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { type: true },
  });
  if (!conv || conv.type !== ConversationType.GROUP) {
    throw new Error("Not a group conversation");
  }
  await prisma.conversationParticipant.delete({
    where: { conversationId_userId: { conversationId, userId } },
  });
}
