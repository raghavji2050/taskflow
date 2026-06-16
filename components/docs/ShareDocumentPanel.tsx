"use client";

import { X } from "lucide-react";
import {
  ConversationTargetPicker,
  type ConversationTarget,
} from "@/components/chat/ConversationTargetPicker";
import { MessageAudienceDisplay } from "@/components/docs/MessageAudienceDisplay";
import type { SerializedLinkedMessage } from "@/lib/message-audience";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ShareDocumentPanelProps {
  documentId: string;
  workspaceId: string | null;
  shareHistory: { message: SerializedLinkedMessage }[];
  readOnly?: boolean;
  onShared?: () => void;
  onRemoveShare?: (messageId: string) => void | Promise<void>;
}

export function ShareDocumentPanel({
  documentId,
  workspaceId,
  shareHistory,
  readOnly,
  onShared,
  onRemoveShare,
}: ShareDocumentPanelProps) {
  const handleSend = async (target: ConversationTarget, note: string) => {
    const payload: { conversationId?: string; userId?: string; body?: string } = {};
    if (target.conversationId) payload.conversationId = target.conversationId;
    else if (target.userId) payload.userId = target.userId;
    if (note) payload.body = note;

    const res = await fetch(`/api/documents/${documentId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Failed to share document");
      throw new Error(data.error || "Failed to share document");
    }
    toast.success(`Shared with ${data.share?.sentToLabel ?? target.label}`);
    onShared?.();
  };

  return (
    <div className="space-y-4">
      <ConversationTargetPicker
        workspaceId={workspaceId}
        readOnly={readOnly}
        hint="Send this doc to a person, group, or team. Recipients will see a document preview in chat."
        notePlaceholder="Add a message… (optional)"
        sendLabel="Send"
        onSend={handleSend}
      />

      <div className={cn(!readOnly && "border-t border-[var(--card-border)] pt-4")}>
        <p className="mb-2 text-xs font-semibold text-[var(--foreground)]">Share history</p>
        {shareHistory.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">Not shared in chat yet.</p>
        ) : (
          <ul className="space-y-2">
            {shareHistory.map(({ message }) => (
              <li
                key={message.id}
                className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-2.5"
              >
                <MessageAudienceDisplay
                  sender={message.sender}
                  audience={message.audience}
                  sentToLabel={message.sentToLabel}
                  destinationPrefix="Sent to"
                  createdAt={message.createdAt}
                />
                {!readOnly && onRemoveShare && (
                  <button
                    type="button"
                    onClick={() => void onRemoveShare(message.id)}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] text-[var(--muted)] hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                    Remove from history
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
