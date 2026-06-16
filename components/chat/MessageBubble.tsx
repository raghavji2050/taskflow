"use client";

import { useEffect, useState } from "react";
import { Forward, MoreHorizontal, Pencil, Pin, Reply, Smile, Trash2 } from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { ReactionPicker } from "@/components/chat/EmojiPicker";
import { MessageBody } from "@/components/chat/MessageBody";
import { PresenceAvatar } from "@/components/chat/PresenceAvatar";
import type { MessageReceiptStatus } from "@/lib/chat-receipts";
import { MessageAttachmentPreview } from "@/components/chat/MessageAttachmentPreview";
import { MessageReceiptTicks } from "@/components/chat/MessageReceiptTicks";
import { DocumentShareCard, type SharedDocumentPreview } from "@/components/chat/DocumentShareCard";
import { ForwardedMessageCard } from "@/components/chat/ForwardedMessageCard";
import { Button } from "@/components/ui/Button";
import type { FormattedForwardedFrom } from "@/lib/message-format";
import { isAttachmentOnlyBody, isImageAttachment } from "@/lib/attachments";
import { isDefaultDocumentShareBody } from "@/lib/document-ui";

export interface MessageAttachment {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  size: number;
}

export interface MessageReaction {
  id: string;
  emoji: string;
  user: { id: string; name: string };
}

export type MessageSendStatus = "sending" | "failed" | "sent";

export interface ChatMessage {
  id: string;
  body: string;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  pinnedAt?: string | null;
  user: { id: string; name: string; image?: string | null };
  parent?: {
    id: string;
    body: string;
    deleted?: boolean;
    createdAt?: string;
    user: { id: string; name: string };
  } | null;
  attachments?: MessageAttachment[];
  reactions?: MessageReaction[];
  receiptStatus?: MessageReceiptStatus;
  sendStatus?: MessageSendStatus;
  clientTempId?: string;
  sharedDocument?: SharedDocumentPreview | null;
  forwardedFrom?: FormattedForwardedFrom | null;
}

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  currentUserId?: string;
  readOnly?: boolean;
  onReply?: (message: ChatMessage) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onPin?: (messageId: string, pinned: boolean) => void;
  onEdit?: (messageId: string, body: string) => Promise<void>;
  onDelete?: (messageId: string) => Promise<void>;
  mentionMembers?: { name: string }[];
  showUserPresence?: boolean;
  hideAvatars?: boolean;
  onJumpToMessage?: (messageId: string, createdAt: string) => void;
  onRetrySend?: (clientTempId: string) => void;
  onForward?: (message: ChatMessage) => void;
}

function groupReactions(reactions: MessageReaction[] = [], currentUserId?: string) {
  const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const r of reactions) {
    const existing = map.get(r.emoji);
    if (existing) {
      existing.count += 1;
      if (r.user.id === currentUserId) existing.mine = true;
    } else {
      map.set(r.emoji, {
        emoji: r.emoji,
        count: 1,
        mine: r.user.id === currentUserId,
      });
    }
  }
  return [...map.values()];
}

export function MessageBubble({
  message,
  isOwn,
  currentUserId,
  readOnly,
  onReply,
  onReact,
  onPin,
  onEdit,
  onDelete,
  mentionMembers = [],
  showUserPresence = false,
  hideAvatars = false,
  onJumpToMessage,
  onRetrySend,
  onForward,
}: MessageBubbleProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(message.body);
  const [saving, setSaving] = useState(false);

  const isDeleted = Boolean(message.deletedAt);
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const reactionGroups = groupReactions(message.reactions, currentUserId);
  const isPinned = Boolean(message.pinnedAt);
  const canModify = isOwn && !isDeleted && !readOnly;

  useEffect(() => {
    if (!editing) setEditBody(message.body);
  }, [message.body, editing]);

  const handleSaveEdit = async () => {
    const trimmed = editBody.trim();
    if (!trimmed || !onEdit) return;
    setSaving(true);
    try {
      await onEdit(message.id, trimmed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!window.confirm("Delete this message?")) return;
    setMenuOpen(false);
    await onDelete(message.id);
  };

  const isFailed = message.sendStatus === "failed";
  const isSending = message.sendStatus === "sending";
  const showBody =
    Boolean(message.body) &&
    !(
      message.attachments?.length &&
      message.attachments.every((a) => isImageAttachment(a.mimeType)) &&
      message.attachments.some((a) => isAttachmentOnlyBody(message.body, a.filename))
    ) &&
    !(
      message.sharedDocument &&
      isDefaultDocumentShareBody(
        message.body,
        message.sharedDocument.title,
        message.sharedDocument.icon
      )
    );

  return (
    <div className={cn("group flex w-full px-0.5 sm:px-1", isOwn ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "flex w-max max-w-[82%] sm:max-w-[85%] md:max-w-[75%]",
          hideAvatars ? "gap-0" : "gap-2",
          isOwn ? "flex-row-reverse" : "flex-row"
        )}
      >
      {!hideAvatars && (showUserPresence && !isOwn ? (
        <PresenceAvatar
          name={message.user.name}
          image={message.user.image}
          userId={message.user.id}
          size="xs"
        />
      ) : (
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 self-start items-center justify-center rounded-full text-xs font-semibold",
            isOwn ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-hover)] text-[var(--foreground)]"
          )}
        >
          {message.user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={message.user.image} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            getInitials(message.user.name)
          )}
        </div>
      ))}

      <div className={cn("relative min-w-0 flex flex-col", isOwn ? "items-end" : "items-start")}>
        {!isOwn && !hideAvatars && (
          <p className="mb-0.5 px-1 text-[11px] font-medium text-[var(--muted)]">
            {message.user.name}
          </p>
        )}

        {isPinned && !isDeleted && (
          <p className="mb-0.5 flex items-center gap-1 px-1 text-[10px] font-medium text-amber-500">
            <Pin className="h-3 w-3" /> Pinned
          </p>
        )}

        <div className="relative">
          <div
            className={cn(
              "rounded-2xl px-3 py-2 text-sm leading-relaxed",
              isDeleted
                ? "rounded-lg border border-dashed border-[var(--card-border)] bg-[var(--surface-hover)]/50 italic text-[var(--muted)]"
                : isOwn
                  ? "rounded-tr-md bg-[var(--accent)] text-white"
                  : "rounded-tl-md border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)]"
            )}
          >
            {message.parent && !isDeleted && (
              message.parent.deleted || !onJumpToMessage || !message.parent.createdAt ? (
                <div
                  className={cn(
                    "mb-2 rounded-lg border-l-2 px-2 py-1 text-xs opacity-90",
                    isOwn ? "border-white/50 bg-white/10" : "border-[var(--accent)] bg-[var(--surface-hover)]"
                  )}
                >
                  <p className="font-semibold">{message.parent.user.name}</p>
                  <div className="truncate text-xs">
                    {message.parent.deleted ? (
                      "Message deleted"
                    ) : (
                      <MessageBody
                        body={message.parent.body}
                        members={mentionMembers}
                        inline
                        className="truncate"
                        linkClassName={isOwn ? "text-white underline" : undefined}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onJumpToMessage(message.parent!.id, message.parent!.createdAt!)}
                  className={cn(
                    "mb-2 w-full rounded-lg border-l-2 px-2 py-1 text-left text-xs opacity-90 transition-opacity hover:opacity-100",
                    isOwn ? "border-white/50 bg-white/10" : "border-[var(--accent)] bg-[var(--surface-hover)]"
                  )}
                  aria-label="Jump to quoted message"
                >
                  <p className="font-semibold">{message.parent.user.name}</p>
                  <div className="truncate text-xs">
                    <MessageBody
                      body={message.parent.body}
                      members={mentionMembers}
                      inline
                      className="truncate"
                      linkClassName={isOwn ? "text-white underline" : undefined}
                    />
                  </div>
                </button>
              )
            )}

            {isDeleted ? (
              <p>This message was deleted</p>
            ) : editing ? (
              <div className="space-y-2">
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                  autoFocus
                />
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditing(false);
                      setEditBody(message.body);
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void handleSaveEdit()}
                    isLoading={saving}
                    disabled={!editBody.trim()}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {message.forwardedFrom && !isDeleted && (
                  <ForwardedMessageCard
                    forwarded={message.forwardedFrom}
                    isOwn={isOwn}
                    mentionMembers={mentionMembers}
                  />
                )}

                {showBody && (
                  <MessageBody
                    body={message.body}
                    members={mentionMembers}
                    mentionClassName={isOwn ? "text-white bg-white/15" : undefined}
                    linkClassName={isOwn ? "text-white underline" : undefined}
                  />
                )}

                {!message.forwardedFrom && message.attachments && message.attachments.length > 0 && (
                  <MessageAttachmentPreview
                    attachments={message.attachments}
                    isOwn={isOwn}
                    messageBody={message.body}
                  />
                )}

                {!message.forwardedFrom && message.sharedDocument && !isDeleted && (
                  <DocumentShareCard document={message.sharedDocument} isOwn={isOwn} />
                )}
              </>
            )}
          </div>

          {!readOnly && !isDeleted && !editing && (
            <div
              className={cn(
                "flex gap-0.5",
                "mt-1.5 justify-end md:absolute md:top-0 md:mt-0 md:opacity-0 md:transition-opacity md:group-hover:opacity-100",
                isOwn
                  ? "md:left-0 md:-translate-x-full md:pr-1"
                  : "justify-start md:right-0 md:translate-x-full md:pl-1 md:justify-end"
              )}
            >
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setReactOpen((v) => !v); setMenuOpen(false); }}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--card-border)] bg-[var(--card)] text-[var(--muted)] shadow-sm hover:text-[var(--foreground)]"
                  aria-label="React"
                >
                  <Smile className="h-3.5 w-3.5" />
                </button>
                {reactOpen && onReact && (
                  <ReactionPicker
                    onSelect={(emoji) => onReact(message.id, emoji)}
                    onClose={() => setReactOpen(false)}
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => { setMenuOpen((v) => !v); setReactOpen(false); }}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--card-border)] bg-[var(--card)] text-[var(--muted)] shadow-sm hover:text-[var(--foreground)]"
                aria-label="More actions"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div
                    className={cn(
                      "absolute z-50 mt-1 min-w-[8rem] rounded-lg border border-[var(--card-border)] bg-[var(--card)] py-1 shadow-lg",
                      "max-md:fixed max-md:bottom-4 max-md:left-1/2 max-md:mt-0 max-md:w-[min(16rem,calc(100vw-2rem))] max-md:-translate-x-1/2",
                      isOwn ? "left-0 md:left-0" : "right-0 md:right-0"
                    )}
                  >
                    {onReply && (
                      <button
                        type="button"
                        onClick={() => { onReply(message); setMenuOpen(false); }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--surface-hover)]"
                      >
                        <Reply className="h-3.5 w-3.5" /> Reply
                      </button>
                    )}
                    {onForward && !isDeleted && (
                      <button
                        type="button"
                        onClick={() => { onForward(message); setMenuOpen(false); }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--surface-hover)]"
                      >
                        <Forward className="h-3.5 w-3.5" /> Forward
                      </button>
                    )}
                    {canModify && onEdit && message.body && (
                      <button
                        type="button"
                        onClick={() => { setEditing(true); setMenuOpen(false); }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--surface-hover)]"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                    )}
                    {onPin && (
                      <button
                        type="button"
                        onClick={() => { onPin(message.id, !isPinned); setMenuOpen(false); }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--surface-hover)]"
                      >
                        <Pin className="h-3.5 w-3.5" /> {isPinned ? "Unpin" : "Pin"}
                      </button>
                    )}
                    {canModify && onDelete && (
                      <button
                        type="button"
                        onClick={() => void handleDelete()}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {!isDeleted && reactionGroups.length > 0 && (
          <div className={cn("mt-1 flex flex-wrap gap-1", isOwn && "justify-end")}>
            {reactionGroups.map((g) => (
              <button
                key={g.emoji}
                type="button"
                disabled={readOnly || !onReact}
                onClick={() => onReact?.(message.id, g.emoji)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-[var(--surface-hover)]",
                  g.mine
                    ? "border-[var(--accent)] bg-[var(--accent)]/10"
                    : "border-[var(--card-border)] bg-[var(--card)]"
                )}
              >
                {g.emoji}
                <span className="text-[10px] text-[var(--muted)]">{g.count}</span>
              </button>
            ))}
          </div>
        )}

        <p className={cn("mt-0.5 flex items-center gap-1 px-1 text-[10px] text-[var(--muted)]", isOwn && "justify-end")}>
          <span>
            {time}
            {message.editedAt && !isDeleted && (
              <span className="ml-1 opacity-70">(edited)</span>
            )}
          </span>
          {isFailed && message.clientTempId && onRetrySend && (
            <button
              type="button"
              onClick={() => onRetrySend(message.clientTempId!)}
              className="text-red-400 underline"
            >
              Failed — retry
            </button>
          )}
          {isSending && <span className="opacity-70">Sending…</span>}
          {isOwn && !isDeleted && !isSending && !isFailed && message.receiptStatus && (
            <MessageReceiptTicks status={message.receiptStatus} />
          )}
        </p>
      </div>
      </div>
    </div>
  );
}
