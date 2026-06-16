"use client";

import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import {
  ConversationTargetPicker,
  type ConversationTarget,
} from "@/components/chat/ConversationTargetPicker";
import { ForwardedMessageCard } from "@/components/chat/ForwardedMessageCard";
import type { ChatMessage } from "@/components/chat/MessageBubble";
import type { FormattedForwardedFrom } from "@/lib/message-format";

interface ForwardMessageModalProps {
  message: ChatMessage | null;
  isOpen: boolean;
  onClose: () => void;
  workspaceId?: string | null;
}

function previewForwardedFrom(message: ChatMessage): FormattedForwardedFrom {
  if (message.forwardedFrom) return message.forwardedFrom;

  return {
    id: message.id,
    body: message.body,
    deleted: Boolean(message.deletedAt),
    createdAt: message.createdAt,
    user: { id: message.user.id, name: message.user.name },
    attachments: message.attachments ?? [],
    sharedDocument: message.sharedDocument ?? null,
    sourceLabel: "this chat",
  };
}

export function ForwardMessageModal({
  message,
  isOpen,
  onClose,
  workspaceId = null,
}: ForwardMessageModalProps) {
  const handleSend = async (target: ConversationTarget, note: string) => {
    if (!message) return;

    const payload: {
      sourceMessageId: string;
      conversationId?: string;
      userId?: string;
      body?: string;
    } = { sourceMessageId: message.id };

    if (target.conversationId) payload.conversationId = target.conversationId;
    else if (target.userId) payload.userId = target.userId;
    if (note) payload.body = note;

    const res = await fetch("/api/messages/forward", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Failed to forward message");
      return;
    }

    toast.success(`Forwarded to ${target.label}`);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Forward message"
      description="Choose where to send this message."
      size="md"
    >
      {message && (
        <div className="space-y-4">
          <div className="rounded-lg border border-[var(--card-border)] bg-[var(--surface-hover)] p-3">
            <p className="mb-2 text-xs font-semibold text-[var(--muted)]">Preview</p>
            <ForwardedMessageCard forwarded={previewForwardedFrom(message)} />
          </div>

          <ConversationTargetPicker
            workspaceId={workspaceId}
            hint="Forward to a person, group, or team. Add an optional comment above the forwarded message."
            notePlaceholder="Add a comment… (optional)"
            sendLabel="Forward"
            onSend={handleSend}
          />
        </div>
      )}
    </Modal>
  );
}
