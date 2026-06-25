import { prisma } from "@/lib/prisma";
import { messageInclude, formatMessageForClient } from "@/lib/message-format";
import { notifyParticipants } from "@/lib/message-notify";

export type GroupActivityAction =
  | "group_created"
  | "group_renamed"
  | "member_added"
  | "member_removed"
  | "member_left"
  | "member_promoted"
  | "member_demoted"
  | "ownership_transferred";

export async function recordGroupActivity(params: {
  conversationId: string;
  actorUserId: string;
  actorName: string;
  action: GroupActivityAction;
  body: string;
  conversationTitle: string;
  mentionCandidates: { id: string; name: string }[];
  targetUserId?: string;
  targetName?: string;
  details?: string;
}) {
  const {
    conversationId,
    actorUserId,
    actorName,
    action,
    body,
    conversationTitle,
    mentionCandidates,
    targetUserId,
    targetName,
    details,
  } = params;

  await prisma.conversationActivity.create({
    data: {
      conversationId,
      actorUserId,
      targetUserId: targetUserId ?? null,
      action,
      details: details ?? (targetName ? `target:${targetName}` : null),
    },
  });

  const message = await prisma.message.create({
    data: {
      conversationId,
      userId: actorUserId,
      body,
      systemKind: action,
    },
    include: messageInclude,
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  const formatted = formatMessageForClient(message);

  await notifyParticipants({
    conversationId,
    userId: actorUserId,
    userName: actorName,
    preview: body,
    conversationTitle,
    mentionCandidates,
    body,
    messageId: message.id,
    message: formatted,
    type: "message:created",
  });

  return formatted;
}
