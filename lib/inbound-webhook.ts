import { randomBytes } from "node:crypto";
import { ConversationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendMessage } from "@/lib/messages";
import {
  getConversationDisplayName,
  getMentionCandidatesForConversation,
} from "@/lib/conversations";

const INBOUND_BOT_EMAIL = "inbound@taskflow.local";
const INBOUND_BOT_NAME = "External";

export { INBOUND_BOT_EMAIL };

const ALLOWED_TYPES: ConversationType[] = [
  ConversationType.GROUP,
  ConversationType.WORKSPACE,
];

export function generateInboundToken(): string {
  return randomBytes(24).toString("base64url");
}

export function inboundWebhookPath(token: string): string {
  return `/api/inbound/${token}`;
}

export function canEnableInboundWebhook(type: ConversationType): boolean {
  return ALLOWED_TYPES.includes(type);
}

/** Dedicated bot user that posts inbound webhook messages. */
export async function ensureInboundBotUser() {
  const existing = await prisma.user.findUnique({
    where: { email: INBOUND_BOT_EMAIL },
    select: { id: true, name: true, image: true },
  });
  if (existing) return existing;

  return prisma.user.create({
    data: {
      email: INBOUND_BOT_EMAIL,
      name: INBOUND_BOT_NAME,
      // No password — cannot log in; used only as message author.
    },
    select: { id: true, name: true, image: true },
  });
}

async function ensureBotParticipant(conversationId: string, botUserId: string) {
  await prisma.conversationParticipant.upsert({
    where: {
      conversationId_userId: { conversationId, userId: botUserId },
    },
    create: { conversationId, userId: botUserId },
    update: {},
  });
}

/** Stable pseudo-user so the chat bubble shows the external app name as author. */
async function ensureInboundSenderUser(senderName: string) {
  const slug =
    senderName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "app";
  const email = `inbound+${slug}@taskflow.local`;

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, image: true },
  });
  if (existing) {
    if (existing.name !== senderName) {
      return prisma.user.update({
        where: { id: existing.id },
        data: { name: senderName },
        select: { id: true, name: true, image: true },
      });
    }
    return existing;
  }

  return prisma.user.create({
    data: { email, name: senderName },
    select: { id: true, name: true, image: true },
  });
}

export async function getConversationInboundStatus(conversationId: string, userId: string) {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: {
      conversation: {
        select: { id: true, type: true, inboundToken: true },
      },
    },
  });
  if (!participant) return null;

  const { type, inboundToken } = participant.conversation;
  return {
    enabled: Boolean(inboundToken),
    allowed: canEnableInboundWebhook(type),
    token: inboundToken,
    path: inboundToken ? inboundWebhookPath(inboundToken) : null,
  };
}

export async function enableConversationInbound(conversationId: string, userId: string) {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: {
      conversation: { select: { id: true, type: true, inboundToken: true } },
    },
  });
  if (!participant) throw new Error("Not found");
  if (!canEnableInboundWebhook(participant.conversation.type)) {
    throw new Error("Inbound webhooks are only available for groups and team channels");
  }

  const token = participant.conversation.inboundToken ?? generateInboundToken();
  if (!participant.conversation.inboundToken) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { inboundToken: token },
    });
  }

  const bot = await ensureInboundBotUser();
  await ensureBotParticipant(conversationId, bot.id);

  return {
    enabled: true,
    allowed: true,
    token,
    path: inboundWebhookPath(token),
  };
}

export async function rotateConversationInbound(conversationId: string, userId: string) {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: {
      conversation: { select: { id: true, type: true } },
    },
  });
  if (!participant) throw new Error("Not found");
  if (!canEnableInboundWebhook(participant.conversation.type)) {
    throw new Error("Inbound webhooks are only available for groups and team channels");
  }

  const token = generateInboundToken();
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { inboundToken: token },
  });

  const bot = await ensureInboundBotUser();
  await ensureBotParticipant(conversationId, bot.id);

  return {
    enabled: true,
    allowed: true,
    token,
    path: inboundWebhookPath(token),
  };
}

export async function disableConversationInbound(conversationId: string, userId: string) {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { conversationId: true },
  });
  if (!participant) throw new Error("Not found");

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { inboundToken: null },
  });

  return { enabled: false, allowed: true, token: null, path: null };
}

export async function postInboundMessage(params: {
  token: string;
  body: string;
  senderName?: string | null;
}) {
  const conversation = await prisma.conversation.findUnique({
    where: { inboundToken: params.token },
    select: {
      id: true,
      type: true,
      name: true,
      workspaceId: true,
      workspace: { select: { name: true } },
      participants: { select: { user: { select: { id: true, name: true } } } },
    },
  });
  if (!conversation || !canEnableInboundWebhook(conversation.type)) {
    return { error: "Invalid or disabled webhook", status: 404 as const };
  }

  const trimmed = params.body.trim();
  if (!trimmed) {
    return { error: "Message body is required", status: 400 as const };
  }
  if (trimmed.length > 4000) {
    return { error: "Message body is too long (max 4000 characters)", status: 400 as const };
  }

  const senderLabel = params.senderName?.trim().slice(0, 80) || null;

  // Author shows as the app name in the bubble; body is the message only.
  const author = senderLabel
    ? await ensureInboundSenderUser(senderLabel)
    : await ensureInboundBotUser();
  await ensureBotParticipant(conversation.id, author.id);

  const conversationTitle = getConversationDisplayName(conversation, author.id);
  const mentionCandidates = await getMentionCandidatesForConversation(conversation);

  const message = await sendMessage({
    conversationId: conversation.id,
    userId: author.id,
    userName: author.name,
    body: trimmed,
    conversationTitle,
    mentionCandidates,
  });

  return { message, status: 201 as const };
}
