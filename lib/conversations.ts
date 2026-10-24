import { ConversationType, WorkspaceRole, ConversationRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getWorkspaceMembershipIncludingArchived } from "@/lib/workspace";
import { broadcastConversationRemoved } from "@/lib/realtime";
import { canManageGroupSettings, canRemoveMember, type GroupRole } from "@/lib/group-permissions";
import { recordGroupActivity } from "@/lib/conversation-activity";

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
  if (uniqueIds.length < 1) {
    throw new Error("Group chat requires a creator");
  }

  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, name: true },
  });
  if (users.length !== uniqueIds.length) {
    throw new Error("One or more members not found");
  }

  const creator = users.find((u) => u.id === creatorId);

  const conv = await prisma.conversation.create({
    data: {
      type: ConversationType.GROUP,
      name: name?.trim() || null,
      createdById: creatorId,
      participants: {
        create: uniqueIds.map((userId) => ({
          userId,
          role: userId === creatorId ? ConversationRole.OWNER : ConversationRole.MEMBER,
        })),
      },
    },
    include: conversationInclude,
  });

  const addedNames = conv.participants
    .filter((p) => p.userId !== creatorId)
    .map((p) => p.user.name);
  const title = name?.trim() || "Group chat";
  const mentionCandidates = conv.participants.map((p) => ({
    id: p.user.id,
    name: p.user.name,
  }));

  await recordGroupActivity({
    conversationId: conv.id,
    actorUserId: creatorId,
    actorName: creator?.name ?? "Someone",
    action: "group_created",
    body:
      addedNames.length > 0
        ? `${creator?.name ?? "Someone"} created the group and added ${addedNames.join(", ")}`
        : `${creator?.name ?? "Someone"} created the group`,
    conversationTitle: title,
    mentionCandidates,
  });

  return conv;
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

  if (toRemove.length === 0 && toAdd.length === 0) return;

  await prisma.$transaction([
    ...(toRemove.length > 0
      ? [
          prisma.conversationParticipant.deleteMany({
            where: { id: { in: toRemove.map((p) => p.id) } },
          }),
        ]
      : []),
    ...(toAdd.length > 0
      ? [
          prisma.conversationParticipant.createMany({
            data: toAdd.map((userId) => ({
              conversationId: conversation.id,
              userId,
            })),
          }),
        ]
      : []),
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

type DirectUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  lastSeenAt: Date | null;
};

type LastVisibleMessage = {
  id: string;
  body: string;
  createdAt: Date;
  user: { id: string; name: string };
};

function asDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

async function visibleDirectConversationIds(userId: string, conversationIds: string[]) {
  if (conversationIds.length === 0) return new Set<string>();
  const rows = await prisma.message.findMany({
    where: {
      conversationId: { in: conversationIds },
      deletedAt: null,
      userId: { not: userId },
    },
    distinct: ["conversationId"],
    select: { conversationId: true },
  });
  return new Set(rows.map((row) => row.conversationId));
}

function isListedConversationVisible(
  userId: string,
  conversation: { id: string; type: ConversationType; createdById: string },
  peerMessageIds: Set<string>
) {
  if (conversation.type !== ConversationType.DIRECT) return true;
  if (conversation.createdById === userId) return true;
  return peerMessageIds.has(conversation.id);
}

async function unreadCountsByConversation(userId: string, conversationIds: string[]) {
  const counts = new Map<string, number>();
  if (conversationIds.length === 0) return counts;
  const rows = await prisma.$queryRaw<{ conversationId: string; cnt: bigint | number }[]>`
    SELECT m.conversationId AS conversationId, COUNT(*) AS cnt
    FROM Message m
    INNER JOIN ConversationParticipant p
      ON p.conversationId = m.conversationId AND p.userId = ${userId}
    WHERE m.deletedAt IS NULL
      AND m.userId <> ${userId}
      AND m.conversationId IN (${Prisma.join(conversationIds)})
      AND (
        (p.lastReadAt IS NULL AND p.clearedAt IS NULL)
        OR (p.lastReadAt IS NULL AND p.clearedAt IS NOT NULL AND m.createdAt > p.clearedAt)
        OR (p.clearedAt IS NULL AND p.lastReadAt IS NOT NULL AND m.createdAt > p.lastReadAt)
        OR (
          p.lastReadAt IS NOT NULL
          AND p.clearedAt IS NOT NULL
          AND m.createdAt > IF(p.lastReadAt >= p.clearedAt, p.lastReadAt, p.clearedAt)
        )
      )
    GROUP BY m.conversationId
  `;
  for (const row of rows) counts.set(row.conversationId, Number(row.cnt));
  return counts;
}

async function lastVisibleMessagesByConversation(userId: string, conversationIds: string[]) {
  const byConversation = new Map<string, LastVisibleMessage>();
  if (conversationIds.length === 0) return byConversation;
  const rows = await prisma.$queryRaw<
    {
      id: string;
      conversationId: string;
      body: string;
      createdAt: Date | string;
      userId: string;
      userName: string;
    }[]
  >`
    SELECT m.id AS id, m.conversationId AS conversationId, m.body AS body,
           m.createdAt AS createdAt, u.id AS userId, u.name AS userName
    FROM Message m
    INNER JOIN User u ON u.id = m.userId
    INNER JOIN ConversationParticipant p
      ON p.conversationId = m.conversationId AND p.userId = ${userId}
    WHERE m.deletedAt IS NULL
      AND m.conversationId IN (${Prisma.join(conversationIds)})
      AND (p.clearedAt IS NULL OR m.createdAt > p.clearedAt)
      AND m.createdAt = (
        SELECT MAX(m2.createdAt)
        FROM Message m2
        WHERE m2.conversationId = m.conversationId
          AND m2.deletedAt IS NULL
          AND (p.clearedAt IS NULL OR m2.createdAt > p.clearedAt)
      )
  `;
  for (const row of rows) {
    const createdAt = asDate(row.createdAt);
    const existing = byConversation.get(row.conversationId);
    if (
      !existing ||
      createdAt > existing.createdAt ||
      (createdAt.getTime() === existing.createdAt.getTime() && row.id > existing.id)
    ) {
      byConversation.set(row.conversationId, {
        id: row.id,
        body: row.body,
        createdAt,
        user: { id: row.userId, name: row.userName },
      });
    }
  }
  return byConversation;
}

async function directParticipantsByConversation(conversationIds: string[]) {
  const grouped = new Map<string, Map<string, DirectUser>>();
  if (conversationIds.length === 0) return grouped;

  const active = await prisma.conversationParticipant.findMany({
    where: { conversationId: { in: conversationIds } },
    include: { user: { select: dmUserSelect } },
  });
  for (const row of active) {
    const users = grouped.get(row.conversationId) ?? new Map<string, DirectUser>();
    users.set(row.user.id, row.user);
    grouped.set(row.conversationId, users);
  }

  const needAuthors = conversationIds.filter((id) => (grouped.get(id)?.size ?? 0) < 2);
  if (needAuthors.length > 0) {
    const authors = await prisma.message.findMany({
      where: { conversationId: { in: needAuthors } },
      distinct: ["conversationId", "userId"],
      select: {
        conversationId: true,
        userId: true,
        user: { select: dmUserSelect },
      },
    });
    for (const row of authors) {
      const users = grouped.get(row.conversationId) ?? new Map<string, DirectUser>();
      if (!users.has(row.user.id)) users.set(row.user.id, row.user);
      grouped.set(row.conversationId, users);
    }
  }

  return grouped;
}

async function workspacePostFlags(userId: string, workspaceIds: string[]) {
  const flags = new Map<string, boolean>();
  if (workspaceIds.length === 0) return flags;
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId, workspaceId: { in: workspaceIds } },
    select: {
      workspaceId: true,
      role: true,
      workspace: { select: { archivedAt: true } },
    },
  });
  for (const membership of memberships) {
    flags.set(
      membership.workspaceId,
      membership.role !== WorkspaceRole.VIEWER && !membership.workspace.archivedAt
    );
  }
  return flags;
}

function canPostWithFlags(
  conversation: { type: ConversationType; workspaceId: string | null },
  flags: Map<string, boolean>
) {
  if (conversation.type === ConversationType.WORKSPACE && conversation.workspaceId) {
    return flags.get(conversation.workspaceId) ?? false;
  }
  return true;
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

  const hiddenDirectIds = rows
    .filter(
      (row) =>
        row.conversation.type === ConversationType.DIRECT &&
        row.conversation.createdById !== userId
    )
    .map((row) => row.conversationId);
  const peerVisible = await visibleDirectConversationIds(userId, hiddenDirectIds);
  const visibleRows = rows.filter((row) =>
    isListedConversationVisible(userId, row.conversation, peerVisible)
  );
  const visibleIds = visibleRows.map((row) => row.conversationId);
  const directIds = visibleRows
    .filter((row) => row.conversation.type === ConversationType.DIRECT)
    .map((row) => row.conversationId);
  const workspaceIds = [
    ...new Set(
      visibleRows
        .filter((row) => row.conversation.type === ConversationType.WORKSPACE)
        .map((row) => row.conversation.workspaceId)
        .filter((id): id is string => !!id)
    ),
  ];

  const [unreadByConversation, lastByConversation, directUsers, postFlags] = await Promise.all([
    unreadCountsByConversation(userId, visibleIds),
    lastVisibleMessagesByConversation(userId, visibleIds),
    directParticipantsByConversation(directIds),
    workspacePostFlags(userId, workspaceIds),
  ]);

  const conversations = visibleRows.map((row) => {
    const clearedAt = row.clearedAt ?? null;
    const participants =
      row.conversation.type === ConversationType.DIRECT
        ? Array.from(directUsers.get(row.conversationId)?.values() ?? [])
        : row.conversation.participants.map((p) => ({
            ...p.user,
            role: p.role as GroupRole,
          }));

    const conversationForName = {
      ...row.conversation,
      participants: participants.map((user) => ({ user })),
    };
    const lastMsg = lastByConversation.get(row.conversationId) ?? null;

    return {
      id: row.conversation.id,
      type: row.conversation.type,
      name: getConversationDisplayName(conversationForName, userId),
      rawName: row.conversation.name,
      workspaceId: row.conversation.workspaceId,
      workspace: row.conversation.workspace,
      participants,
      currentUserRole:
        row.conversation.type === ConversationType.GROUP
          ? (row.role as GroupRole)
          : undefined,
      lastMessage: lastMsg
        ? {
            id: lastMsg.id,
            body: lastMsg.body,
            createdAt: lastMsg.createdAt.toISOString(),
            user: lastMsg.user,
          }
        : null,
      unreadCount: unreadByConversation.get(row.conversationId) ?? 0,
      canPost: canPostWithFlags(row.conversation, postFlags),
      archivedAt: row.archivedAt?.toISOString() ?? null,
      clearedAt: clearedAt?.toISOString() ?? null,
      updatedAt: row.conversation.updatedAt.toISOString(),
    };
  });

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

  const hiddenDirectIds = participants
    .filter(
      (row) =>
        row.conversation.type === ConversationType.DIRECT &&
        row.conversation.createdById !== userId
    )
    .map((row) => row.conversationId);
  const peerVisible = await visibleDirectConversationIds(userId, hiddenDirectIds);
  const visibleIds = participants
    .filter((row) => isListedConversationVisible(userId, row.conversation, peerVisible))
    .map((row) => row.conversationId);
  const unread = await unreadCountsByConversation(userId, visibleIds);
  let total = 0;
  for (const count of unread.values()) total += count;
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
      : row.conversation.participants.map((p) => ({
          ...p.user,
          role: p.role as GroupRole,
        }));

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
    currentUserRole:
      row.conversation.type === ConversationType.GROUP
        ? (row.role as GroupRole)
        : undefined,
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

  if (conv.type === ConversationType.GROUP) {
    if (conv.participants.length <= 1) {
      await prisma.conversation.delete({ where: { id: conversationId } });
      broadcastConversationRemoved(userId, conversationId);
      return { deleted: true as const };
    }
    await leaveGroupConversation(conversationId, userId);
    broadcastConversationRemoved(userId, conversationId);
    return { deleted: false as const, left: true as const };
  }

  throw new Error("This conversation cannot be deleted");
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

  const missing = [...dmUserIds].filter((uid) => !activeIds.has(uid));
  if (missing.length > 0) {
    await prisma.conversationParticipant.createMany({
      data: missing.map((userId) => ({ conversationId, userId })),
    });
  }
}

async function getGroupActorContext(conversationId: string, userId: string) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      type: true,
      name: true,
      workspace: { select: { name: true } },
      participants: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });
  if (!conv || conv.type !== ConversationType.GROUP) {
    throw new Error("Not a group conversation");
  }
  const actor = conv.participants.find((p) => p.userId === userId);
  if (!actor) throw new Error("Not a participant");
  return { conv, actor };
}

function groupMentionCandidates(
  participants: { user: { id: string; name: string } }[]
) {
  return participants.map((p) => ({ id: p.user.id, name: p.user.name }));
}

export async function renameGroupConversation(
  conversationId: string,
  userId: string,
  name: string
) {
  const { conv, actor } = await getGroupActorContext(conversationId, userId);
  if (!canManageGroupSettings(actor.role as GroupRole)) {
    throw new Error("Forbidden");
  }

  const oldName = conv.name ?? "Group chat";
  const newName = name.trim() || null;
  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { name: newName },
  });

  const title = newName ?? "Group chat";
  await recordGroupActivity({
    conversationId,
    actorUserId: userId,
    actorName: actor.user.name,
    action: "group_renamed",
    body: `${actor.user.name} renamed the group to ${title}`,
    conversationTitle: title,
    mentionCandidates: groupMentionCandidates(conv.participants),
    details: `from:${oldName}`,
  });

  return updated;
}

export async function addGroupMembers(
  conversationId: string,
  actorId: string,
  memberIds: string[]
) {
  const { conv, actor } = await getGroupActorContext(conversationId, actorId);
  if (!canManageGroupSettings(actor.role as GroupRole)) {
    throw new Error("Forbidden");
  }

  const unique = [...new Set(memberIds.filter((id) => id !== actorId))];
  if (unique.length === 0) return;

  const existing = await prisma.conversationParticipant.findMany({
    where: { conversationId, userId: { in: unique } },
    select: { userId: true },
  });
  const existingIds = new Set(existing.map((e) => e.userId));

  const addedUsers = await prisma.user.findMany({
    where: { id: { in: unique.filter((id) => !existingIds.has(id)) } },
    select: { id: true, name: true },
  });

  const missingIds = unique.filter((id) => !existingIds.has(id));
  if (addedUsers.length !== missingIds.length) {
    throw new Error("One or more members not found");
  }
  if (addedUsers.length > 0) {
    await prisma.conversationParticipant.createMany({
      data: addedUsers.map((user) => ({
        conversationId,
        userId: user.id,
        role: ConversationRole.MEMBER,
      })),
      skipDuplicates: true,
    });
  }

  const title = conv.name ?? "Group chat";
  const mentionCandidates = groupMentionCandidates(conv.participants);
  for (const user of addedUsers) {
    mentionCandidates.push({ id: user.id, name: user.name });
    await recordGroupActivity({
      conversationId,
      actorUserId: actorId,
      actorName: actor.user.name,
      action: "member_added",
      body: `${actor.user.name} added ${user.name}`,
      conversationTitle: title,
      mentionCandidates,
      targetUserId: user.id,
      targetName: user.name,
    });
  }
}

export async function removeGroupMember(
  conversationId: string,
  actorId: string,
  targetUserId: string
) {
  if (actorId === targetUserId) {
    throw new Error("Use leave to remove yourself");
  }

  const { conv, actor } = await getGroupActorContext(conversationId, actorId);
  const target = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: targetUserId } },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!target) throw new Error("Member not found");
  if (!canRemoveMember(actor.role as GroupRole, target.role as GroupRole)) {
    throw new Error("Forbidden");
  }

  await prisma.conversationParticipant.delete({
    where: { conversationId_userId: { conversationId, userId: targetUserId } },
  });

  broadcastConversationRemoved(targetUserId, conversationId);

  const title = conv.name ?? "Group chat";
  await recordGroupActivity({
    conversationId,
    actorUserId: actorId,
    actorName: actor.user.name,
    action: "member_removed",
    body: `${actor.user.name} removed ${target.user.name}`,
    conversationTitle: title,
    mentionCandidates: groupMentionCandidates(
      conv.participants.filter((p) => p.userId !== targetUserId)
    ),
    targetUserId,
    targetName: target.user.name,
  });
}

export async function leaveGroupConversation(conversationId: string, userId: string) {
  const { conv, actor } = await getGroupActorContext(conversationId, userId);
  const title = conv.name ?? "Group chat";

  await recordGroupActivity({
    conversationId,
    actorUserId: userId,
    actorName: actor.user.name,
    action: "member_left",
    body: `${actor.user.name} left the group`,
    conversationTitle: title,
    mentionCandidates: groupMentionCandidates(
      conv.participants.filter((p) => p.userId !== userId)
    ),
    targetUserId: userId,
    targetName: actor.user.name,
  });

  await prisma.conversationParticipant.delete({
    where: { conversationId_userId: { conversationId, userId } },
  });
}
