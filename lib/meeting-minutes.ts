import { ConversationType, type MeetingMinutes, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConversationParticipantIds } from "@/lib/chat-access";
import { ensureDirectParticipants } from "@/lib/conversations";
import { canAccessDocument, canEditDocument } from "@/lib/documents";
import { defaultMomShareBody } from "@/lib/document-ui";
import {
  buildStructuredMomDocumentBody,
  deriveMomPoints,
  momContentHasData,
  normalizeMomContent,
  parseMomContent,
  type MomStructuredContent,
} from "@/lib/mom-structured";
import {
  buildAttendeesLabel,
  type MomPoints,
  type SharedMomPreview,
  parseMomPoints,
  parseMomAttendeeIds,
  defaultMomTitle,
} from "@/lib/mom-format";
import { messageInclude, formatMessageForClient } from "@/lib/message-format";
import { notifyParticipants } from "@/lib/message-notify";
import { processMomActionItemsForDocument } from "@/lib/mom-tasks";

export type { MomPoints, SharedMomPreview } from "@/lib/mom-format";
export { defaultMomTitle } from "@/lib/mom-format";

export type MomAttendee = { id: string; name: string };

const momInclude = {
  document: { select: { id: true, title: true, type: true, icon: true, workspaceId: true } },
  createdBy: { select: { id: true, name: true } },
} as const;

type MomWithRelations = MeetingMinutes & {
  document: {
    id: string;
    title: string;
    type: string;
    icon: string | null;
    workspaceId: string | null;
  };
  createdBy: { id: string; name: string };
};

function parsePoints(value: Prisma.JsonValue): MomPoints {
  return parseMomPoints(value);
}

function parseAttendeeIds(value: Prisma.JsonValue): string[] {
  return parseMomAttendeeIds(value);
}

export function buildMomDocumentBody(params: {
  title: string;
  startedAt: Date;
  endedAt: Date | null;
  points: MomPoints;
  attendeesLabel: string;
  content?: MomStructuredContent | null;
}) {
  if (params.content && momContentHasData(params.content)) {
    return buildStructuredMomDocumentBody({
      title: params.title,
      startedAt: params.startedAt,
      endedAt: params.endedAt,
      attendeesLabel: params.attendeesLabel,
      content: normalizeMomContent(params.content),
    });
  }

  const lines = [
    `# ${params.title}`,
    "",
    `**Started:** ${params.startedAt.toLocaleString()}`,
    params.endedAt ? `**Ended:** ${params.endedAt.toLocaleString()}` : "**Ended:** —",
    `**Attendees:** ${params.attendeesLabel}`,
    "",
    "## Points covered",
    ...params.points.map((p) => `- ${p}`),
  ];
  return lines.join("\n");
}

export function formatMomForClient(
  mom: MomWithRelations,
  attendees: MomAttendee[],
  conversationType?: ConversationType
): SharedMomPreview {
  const content = parseMomContent(mom.content);
  const pointsFromDb = parsePoints(mom.points);
  const points = content ? deriveMomPoints(content) : pointsFromDb;
  const attendeeUserIds = parseAttendeeIds(mom.attendeeUserIds);
  return {
    id: mom.id,
    documentId: mom.documentId,
    title: mom.title,
    startedAt: mom.startedAt.toISOString(),
    endedAt: mom.endedAt?.toISOString() ?? null,
    pointCount: points.length,
    attendeesLabel: buildAttendeesLabel({
      allAttendees: mom.allAttendees,
      attendeeUserIds,
      attendeeNames: attendees
        .filter((a) => attendeeUserIds.includes(a.id))
        .map((a) => a.name),
      conversationType,
    }),
    allAttendees: mom.allAttendees,
    attendeeUserIds,
    attendeeNames: attendees
      .filter((a) => attendeeUserIds.includes(a.id))
      .map((a) => a.name),
    conversationType,
    points,
  };
}

async function resolveAttendeesForConversation(
  conversationId: string,
  conversationType: ConversationType
) {
  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId },
    select: { user: { select: { id: true, name: true } } },
  });
  return {
    conversationType,
    attendees: participants.map((p) => p.user),
    participantIds: participants.map((p) => p.user.id),
  };
}

function normalizeAttendees(params: {
  conversationType: ConversationType;
  userId: string;
  participantIds: string[];
  attendeeUserIds: string[];
  allAttendees: boolean;
}) {
  if (params.conversationType === ConversationType.PERSONAL) {
    return { attendeeUserIds: [] as string[], allAttendees: false };
  }

  const others = params.participantIds.filter((id) => id !== params.userId);

  if (params.allAttendees) {
    return { attendeeUserIds: others, allAttendees: true };
  }

  const valid = new Set(params.participantIds);
  const filtered = params.attendeeUserIds.filter((id) => valid.has(id) && id !== params.userId);
  if (filtered.length === 0 && others.length === 1) {
    return { attendeeUserIds: others, allAttendees: false };
  }
  return { attendeeUserIds: filtered, allAttendees: false };
}

export async function canAccessMeetingMinutes(userId: string, momId: string) {
  const mom = await prisma.meetingMinutes.findUnique({
    where: { id: momId },
    select: { documentId: true, createdById: true, conversationId: true },
  });
  if (!mom) return null;
  if (mom.createdById === userId) return mom;
  if (await canAccessDocument(userId, mom.documentId)) return mom;
  if (mom.conversationId) {
    const participantIds = await getConversationParticipantIds(mom.conversationId);
    if (participantIds.includes(userId)) return mom;
  }
  return null;
}

export async function canEditMeetingMinutes(userId: string, momId: string) {
  const mom = await canAccessMeetingMinutes(userId, momId);
  if (!mom) return false;
  if (mom.createdById === userId) return true;
  return canEditDocument(userId, mom.documentId);
}

export async function getMeetingMinutesById(momId: string, userId: string) {
  if (!(await canAccessMeetingMinutes(userId, momId))) return null;

  const mom = await prisma.meetingMinutes.findUnique({
    where: { id: momId },
    include: momInclude,
  });
  if (!mom) return null;

  let conversationType: ConversationType | undefined;
  let attendees: MomAttendee[] = [];
  if (mom.conversationId) {
    const conv = await prisma.conversation.findUnique({
      where: { id: mom.conversationId },
      select: { type: true },
    });
    conversationType = conv?.type;
    const resolved = await resolveAttendeesForConversation(mom.conversationId, conversationType!);
    attendees = resolved.attendees;
  }

  const content = parseMomContent(mom.content);

  return {
    ...formatMomForClient(mom, attendees, conversationType),
    content,
    createdBy: mom.createdBy,
    canEdit: await canEditMeetingMinutes(userId, momId),
    workspaceId: mom.document.workspaceId ?? null,
  };
}

export async function createMeetingMinutes(params: {
  conversationId: string;
  userId: string;
  userName: string;
  title?: string;
  startedAt: string;
  endedAt?: string | null;
  content: MomStructuredContent;
  points?: MomPoints;
  note?: string;
  attendeeUserIds?: string[];
  allAttendees?: boolean;
  conversationTitle: string;
  mentionCandidates: { id: string; name: string }[];
  workspaceId?: string | null;
  conversationType: ConversationType;
}) {
  const startedAt = new Date(params.startedAt);
  const endedAt = params.endedAt ? new Date(params.endedAt) : null;
  const title = params.title?.trim() || defaultMomTitle(startedAt);
  const normalizedContent = normalizeMomContent(params.content);
  if (!momContentHasData(normalizedContent)) {
    throw new Error("Add at least one agenda item, discussion point, decision, or action");
  }
  const points = params.points?.map((p) => p.trim()).filter(Boolean) ?? deriveMomPoints(normalizedContent);
  if (points.length === 0) {
    throw new Error("Add at least one agenda item, discussion point, decision, or action");
  }

  const { attendees, participantIds, conversationType } = await resolveAttendeesForConversation(
    params.conversationId,
    params.conversationType
  );

  const normalized = normalizeAttendees({
    conversationType,
    userId: params.userId,
    participantIds,
    attendeeUserIds: params.attendeeUserIds ?? [],
    allAttendees: params.allAttendees ?? false,
  });

  const attendeesLabel = buildAttendeesLabel({
    allAttendees: normalized.allAttendees,
    attendeeUserIds: normalized.attendeeUserIds,
    attendeeNames: attendees
      .filter((a) => normalized.attendeeUserIds.includes(a.id))
      .map((a) => a.name),
    conversationType,
  });

  const body = buildMomDocumentBody({
    title,
    startedAt,
    endedAt,
    points,
    attendeesLabel,
    content: normalizedContent,
  });

  await ensureDirectParticipants(params.conversationId, params.userId);

  const document = await prisma.document.create({
    data: {
      title,
      body,
      type: "MEETING_NOTES",
      icon: "📝",
      userId: params.userId,
      workspaceId: params.workspaceId ?? null,
    },
  });

  const mom = await prisma.meetingMinutes.create({
    data: {
      documentId: document.id,
      conversationId: params.conversationId,
      createdById: params.userId,
      title,
      startedAt,
      endedAt,
      points,
      content: normalizedContent as unknown as Prisma.InputJsonValue,
      attendeeUserIds: normalized.attendeeUserIds,
      allAttendees: normalized.allAttendees,
    },
    include: momInclude,
  });

  const taskSync = await processMomActionItemsForDocument({
    userId: params.userId,
    actorName: params.userName,
    documentId: document.id,
    momTitle: title,
    workspaceId: params.workspaceId ?? null,
    conversationId: params.conversationId,
    content: normalizedContent,
  });

  let momWithTasks = mom;
  if (taskSync.created.length > 0 || taskSync.linked > 0) {
    momWithTasks = await prisma.meetingMinutes.update({
      where: { id: mom.id },
      data: { content: taskSync.content as unknown as Prisma.InputJsonValue },
      include: momInclude,
    });
  }

  const note = params.note?.trim() ?? "";
  const messageBody = note || defaultMomShareBody(title);

  const created = await prisma.message.create({
    data: {
      conversationId: params.conversationId,
      userId: params.userId,
      body: messageBody,
    },
  });

  await prisma.documentMessage.create({
    data: { documentId: document.id, messageId: created.id },
  });

  const message = await prisma.message.findUniqueOrThrow({
    where: { id: created.id },
    include: messageInclude,
  });

  await prisma.conversation.update({
    where: { id: params.conversationId },
    data: { updatedAt: new Date() },
  });

  await prisma.conversationParticipant.updateMany({
    where: { conversationId: params.conversationId },
    data: { archivedAt: null },
  });

  await prisma.conversationParticipant.update({
    where: {
      conversationId_userId: { conversationId: params.conversationId, userId: params.userId },
    },
    data: { lastReadAt: new Date() },
  });

  const formatted = formatMessageForClient(message, params.userId);
  const preview = messageBody.length > 80 ? `${messageBody.slice(0, 80)}…` : messageBody;

  await notifyParticipants({
    conversationId: params.conversationId,
    userId: params.userId,
    userName: params.userName,
    preview,
    conversationTitle: params.conversationTitle,
    mentionCandidates: params.mentionCandidates,
    body: messageBody,
    messageId: message.id,
    message: formatted,
  });

  return {
    mom: formatMomForClient(momWithTasks, attendees, conversationType),
    message: formatted,
    documentId: document.id,
    tasksCreated: taskSync.created.length,
  };
}

export async function updateMeetingMinutes(
  momId: string,
  userId: string,
  patch: {
    title?: string;
    startedAt?: string;
    endedAt?: string | null;
    content?: MomStructuredContent;
    points?: MomPoints;
    attendeeUserIds?: string[];
    allAttendees?: boolean;
  }
) {
  if (!(await canEditMeetingMinutes(userId, momId))) {
    throw new Error("Forbidden");
  }

  const existing = await prisma.meetingMinutes.findUnique({
    where: { id: momId },
    include: momInclude,
  });
  if (!existing) throw new Error("Not found");

  let conversationType: ConversationType | undefined;
  let attendees: MomAttendee[] = [];
  let participantIds: string[] = [];
  if (existing.conversationId) {
    const conv = await prisma.conversation.findUnique({
      where: { id: existing.conversationId },
      select: { type: true },
    });
    conversationType = conv?.type;
    const resolved = await resolveAttendeesForConversation(
      existing.conversationId,
      conversationType!
    );
    attendees = resolved.attendees;
    participantIds = resolved.participantIds;
  }

  const startedAt = patch.startedAt ? new Date(patch.startedAt) : existing.startedAt;
  const endedAt =
    patch.endedAt === null
      ? null
      : patch.endedAt
        ? new Date(patch.endedAt)
        : existing.endedAt;
  const title = patch.title?.trim() || existing.title;
  const existingContent = parseMomContent(existing.content);
  const content = patch.content
    ? normalizeMomContent(patch.content)
    : existingContent;
  const points =
    patch.points?.map((p) => p.trim()).filter(Boolean) ??
    (content ? deriveMomPoints(content) : parsePoints(existing.points));

  const normalized = normalizeAttendees({
    conversationType: conversationType ?? ConversationType.PERSONAL,
    userId,
    participantIds,
    attendeeUserIds:
      patch.attendeeUserIds ?? parseAttendeeIds(existing.attendeeUserIds),
    allAttendees: patch.allAttendees ?? existing.allAttendees,
  });

  const attendeesLabel = buildAttendeesLabel({
    allAttendees: normalized.allAttendees,
    attendeeUserIds: normalized.attendeeUserIds,
    attendeeNames: attendees
      .filter((a) => normalized.attendeeUserIds.includes(a.id))
      .map((a) => a.name),
    conversationType,
  });

  const body = buildMomDocumentBody({
    title,
    startedAt,
    endedAt,
    points,
    attendeesLabel,
    content,
  });

  const mom = await prisma.meetingMinutes.update({
    where: { id: momId },
    data: {
      title,
      startedAt,
      endedAt,
      points,
      ...(content ? { content: content as unknown as Prisma.InputJsonValue } : {}),
      attendeeUserIds: normalized.attendeeUserIds,
      allAttendees: normalized.allAttendees,
    },
    include: momInclude,
  });

  await prisma.document.update({
    where: { id: existing.documentId },
    data: { title, body },
  });

  const link = await prisma.documentMessage.findFirst({
    where: { documentId: existing.documentId },
    select: { messageId: true, message: { select: { conversationId: true } } },
  });

  if (link?.message) {
    const message = await prisma.message.findUniqueOrThrow({
      where: { id: link.messageId },
      include: messageInclude,
    });
    const formatted = formatMessageForClient(message, userId);
    const participantIdsForBroadcast = await getConversationParticipantIds(
      link.message.conversationId
    );
    const { broadcastMessageToConversation } = await import("@/lib/realtime");
    broadcastMessageToConversation(participantIdsForBroadcast, {
      conversationId: link.message.conversationId,
      messageId: link.messageId,
      actorId: userId,
      preview: `MoM updated: ${title}`,
      type: "message:updated",
      message: formatted,
    });
  }

  return formatMomForClient(mom, attendees, conversationType);
}
