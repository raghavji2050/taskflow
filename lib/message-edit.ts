import type { ChatMessage } from "@/components/chat/MessageBubble";
import { plainTextFromBodyJson } from "@/lib/rich-message-serialize";
import type { RichMessageDoc } from "@/lib/rich-message-types";

/** `null` = no time limit on edits. */
export const MESSAGE_EDIT_WINDOW_MS: number | null = null;

type EditableMessage = Pick<
  ChatMessage,
  | "user"
  | "createdAt"
  | "deletedAt"
  | "forwardedFrom"
  | "sharedDocument"
  | "sharedMom"
  | "body"
  | "bodyJson"
>;

export function messageHasEditableText(message: {
  body?: string;
  bodyJson?: unknown | null;
}): boolean {
  if (message.body?.trim()) return true;
  if (!message.bodyJson) return false;
  try {
    return plainTextFromBodyJson(message.bodyJson as RichMessageDoc).trim().length > 0;
  } catch {
    return false;
  }
}

export function isWithinMessageEditWindow(
  createdAt: string,
  now = Date.now()
): boolean {
  if (MESSAGE_EDIT_WINDOW_MS == null) return true;
  const age = now - new Date(createdAt).getTime();
  return age >= 0 && age <= MESSAGE_EDIT_WINDOW_MS;
}

export function getMessageEditBlockReason(
  message: EditableMessage,
  userId: string | undefined,
  options?: { readOnly?: boolean; now?: number }
): string | null {
  if (!userId || options?.readOnly) return "You cannot edit messages here";
  if (message.user.id !== userId) return "You can only edit your own messages";
  if (message.deletedAt) return "Deleted messages cannot be edited";
  if (message.forwardedFrom) return "Forwarded messages cannot be edited";
  if (message.sharedDocument || message.sharedMom) return "This message cannot be edited";
  if (!messageHasEditableText(message)) return "This message has no text to edit";
  if (!isWithinMessageEditWindow(message.createdAt, options?.now)) {
    if (MESSAGE_EDIT_WINDOW_MS === 3_600_000) {
      return "Messages can only be edited within 1 hour of sending";
    }
    const minutes = Math.round((MESSAGE_EDIT_WINDOW_MS ?? 0) / 60_000);
    return `Messages can only be edited within ${minutes} minutes of sending`;
  }
  return null;
}

export function canEditMessage(
  message: EditableMessage,
  userId: string | undefined,
  options?: { readOnly?: boolean; now?: number }
): boolean {
  return getMessageEditBlockReason(message, userId, options) == null;
}

export function assertCanEditMessage(
  message: EditableMessage,
  userId: string,
  options?: { readOnly?: boolean; now?: number }
): void {
  const reason = getMessageEditBlockReason(message, userId, options);
  if (reason) throw new Error(reason);
}
