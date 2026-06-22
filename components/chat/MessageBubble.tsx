"use client";

import { useEffect, useState } from "react";
import { Forward, MoreHorizontal, Pencil, Pin, Reply, Smile, Trash2 } from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { ReactionPicker } from "@/components/chat/EmojiPicker";
import { RichMessageRenderer } from "@/components/chat/RichMessageRenderer";
import { RichMessageEditor } from "@/components/chat/RichMessageEditor";
import type { RichMessageDoc } from "@/lib/rich-message-types";
import { plainTextToRichDoc } from "@/lib/rich-message-types";
import { PresenceAvatar } from "@/components/chat/PresenceAvatar";
import type { MessageReceiptStatus } from "@/lib/chat-receipts";
import { MessageAttachmentPreview } from "@/components/chat/MessageAttachmentPreview";
import { MessageReceiptTicks } from "@/components/chat/MessageReceiptTicks";
import { DocumentShareCard, type SharedDocumentPreview } from "@/components/chat/DocumentShareCard";
import { MomShareCard } from "@/components/chat/MomShareCard";
import { ForwardedMessageCard } from "@/components/chat/ForwardedMessageCard";
import type { SharedMomPreview } from "@/lib/mom-format";
import { Button } from "@/components/ui/Button";
import type { FormattedForwardedFrom } from "@/lib/message-format";
import { isAttachmentOnlyBody } from "@/lib/attachments";
import { isDefaultDocumentShareBody, isMomShareBody } from "@/lib/document-ui";

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
  bodyJson?: unknown | null;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  pinnedAt?: string | null;
  user: { id: string; name: string; image?: string | null };
  parent?: {
    id: string;
    body: string;
    bodyJson?: unknown | null;
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
  sharedMom?: SharedMomPreview | null;
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
  onEdit?: (messageId: string, body: string, bodyJson?: RichMessageDoc | null) => Promise<void>;
  onDelete?: (messageId: string) => Promise<void>;
  mentionMembers?: { id?: string; name: string }[];
  showUserPresence?: boolean;
  hideAvatars?: boolean;
  onJumpToMessage?: (messageId: string, createdAt: string) => void;
  onRetrySend?: (clientTempId: string) => void;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
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
  isFirstInGroup = true,
  isLastInGroup = true,
}: MessageBubbleProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(message.body);
  const [editBodyJson, setEditBodyJson] = useState<RichMessageDoc | null>(
    (message.bodyJson as RichMessageDoc | null) ?? null
  );
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
    if (!editing) {
      setEditBody(message.body);
      setEditBodyJson((message.bodyJson as RichMessageDoc | null) ?? null);
    }
  }, [message.body, message.bodyJson, editing]);

  const handleSaveEdit = async () => {
    const trimmed = editBody.trim();
    if (!trimmed || !onEdit) return;
    setSaving(true);
    try {
      await onEdit(message.id, trimmed, editBodyJson);
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
  const hideAttachmentPlaceholderBody =
    Boolean(message.attachments?.length) &&
    message.attachments!.some((a) => isAttachmentOnlyBody(message.body, a.filename));
  const showBody =
    Boolean(message.body) &&
    !hideAttachmentPlaceholderBody &&
    !(
      message.sharedDocument &&
      isDefaultDocumentShareBody(
        message.body,
        message.sharedDocument.title,
        message.sharedDocument.icon
      )
    ) &&
    !(message.sharedMom && isMomShareBody(message.body));

  const hasAttachments =
    !message.forwardedFrom &&
    Boolean(message.attachments?.length) &&
    !isDeleted &&
    !editing;
  const hasBubbleContent =
    isDeleted ||
    editing ||
    Boolean(message.parent) ||
    Boolean(message.forwardedFrom) ||
    Boolean(message.sharedDocument) ||
    Boolean(message.sharedMom) ||
    showBody;
  const attachmentsInBubble = hasAttachments && hasBubbleContent;
  const attachmentsStandalone = hasAttachments && !hasBubbleContent;

  return (
    <div
      className={cn(
        "group flex w-full animate-message-in px-0.5 sm:px-1",
        isOwn ? "justify-end" : "justify-start",
        !isLastInGroup && "mb-0.5",
        isLastInGroup && "mb-2"
      )}
    >
      <div
        className={cn(
          "flex w-max max-w-[min(92%,100%)] sm:max-w-[85%] md:max-w-[75%]",
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
        {!isOwn && !hideAvatars && isFirstInGroup && (
          <p className="mb-0.5 px-1 text-[11px] font-medium text-[var(--muted)]">
            {message.user.name}
          </p>
        )}

        {isPinned && !isDeleted && (
          <p className="mb-0.5 flex items-center gap-1 px-1 text-[10px] font-medium text-[var(--status-pinned)]">
            <Pin className="h-3 w-3" /> Pinned
          </p>
        )}

        <div className="relative flex flex-col">
          {hasBubbleContent && (
          <div
            className={cn(
              "rounded-2xl px-3 py-2 text-sm leading-relaxed",
              isDeleted
                ? "rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-hover)]/50 italic text-[var(--muted)]"
                : isOwn
                  ? "rounded-tr-md bg-[var(--accent)] text-white"
                  : "rounded-tl-md border border-[var(--border)] bg-[var(--surface-2)] text-[var(--foreground)]"
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
                      <RichMessageRenderer
                        body={message.parent.body}
                        bodyJson={message.parent.bodyJson}
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
                    "mb-2 w-full cursor-pointer rounded-lg border-l-2 px-2 py-1 text-left text-xs opacity-90 transition-opacity hover:opacity-100",
                    isOwn ? "border-white/50 bg-white/10" : "border-[var(--accent)] bg-[var(--surface-hover)]"
                  )}
                  aria-label="Jump to quoted message"
                >
                  <p className="font-semibold">{message.parent.user.name}</p>
                  <div className="truncate text-xs">
                    <RichMessageRenderer
                      body={message.parent.body}
                      bodyJson={message.parent.bodyJson}
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
                <RichMessageEditor
                  bodyJson={editBodyJson ?? plainTextToRichDoc(editBody)}
                  initialContent={editBodyJson ?? plainTextToRichDoc(editBody)}
                  onChange={({ body, bodyJson }) => {
                    setEditBody(body);
                    setEditBodyJson(bodyJson);
                  }}
                  members={mentionMembers.map((m, i) => ({
                    id: m.id ?? `member-${i}`,
                    name: m.name,
                  }))}
                  showToolbar
                  className="rounded-lg border border-[var(--card-border)] bg-[var(--background)]"
                />
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditing(false);
                      setEditBody(message.body);
                      setEditBodyJson((message.bodyJson as RichMessageDoc | null) ?? null);
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
                  <RichMessageRenderer
                    body={message.body}
                    bodyJson={message.bodyJson}
                    members={mentionMembers}
                    mentionClassName={isOwn ? "text-white bg-white/15" : undefined}
                    linkClassName={isOwn ? "text-white underline" : undefined}
                    inOwnBubble={isOwn}
                  />
                )}

                {!message.forwardedFrom && message.sharedDocument && !isDeleted && (
                  <DocumentShareCard document={message.sharedDocument} isOwn={isOwn} />
                )}

                {!message.forwardedFrom && message.sharedMom && !isDeleted && (
                  <MomShareCard mom={message.sharedMom} isOwn={isOwn} />
                )}

                {attachmentsInBubble && message.attachments && (
                  <MessageAttachmentPreview
                    attachments={message.attachments}
                    isOwn={isOwn}
                    messageBody={message.body}
                    isSending={isSending}
                    variant="inBubble"
                  />
                )}
              </>
            )}
          </div>
          )}

          {attachmentsStandalone && message.attachments && (
            <MessageAttachmentPreview
              attachments={message.attachments}
              isOwn={isOwn}
              messageBody={message.body}
              isSending={isSending}
              variant="standalone"
            />
          )}

          {!readOnly && !isDeleted && !editing && (
            <div
              className={cn(
                "relative hidden gap-0.5 md:flex",
                "md:absolute md:top-1/2 md:-translate-y-1/2 md:opacity-0 md:transition-opacity md:group-hover:opacity-100",
                isOwn
                  ? "md:left-0 md:-translate-x-[calc(100%+0.25rem)] md:-translate-y-1/2"
                  : "md:right-0 md:translate-x-[calc(100%+0.25rem)] md:-translate-y-1/2 md:justify-end"
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
                  <div className="fixed inset-0 z-40 hidden md:block" onClick={() => setMenuOpen(false)} />
                  <div
                    className={cn(
                      "absolute top-full z-50 mt-1 hidden min-w-[8rem] rounded-lg border border-[var(--card-border)] bg-[var(--card)] py-1 shadow-lg md:block",
                      isOwn ? "left-0" : "right-0"
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
                  "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed",
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

        <div
          className={cn(
            "mt-0.5 flex items-center gap-1 px-1 text-[10px] tabular-nums text-[var(--muted)]",
            isOwn && "justify-end"
          )}
        >
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
              className="cursor-pointer text-red-400 underline"
            >
              Failed — retry
            </button>
          )}
          {isSending && <span className="opacity-70">Sending…</span>}
          {isOwn && !isDeleted && !isSending && !isFailed && message.receiptStatus && (
            <MessageReceiptTicks status={message.receiptStatus} />
          )}
          {!readOnly && !isDeleted && !editing && (
            <div className="ml-0.5 inline-flex items-center gap-0.5 md:hidden">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setReactOpen((v) => !v);
                    setMenuOpen(false);
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                  aria-label="React"
                >
                  <Smile className="h-3 w-3" />
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
                onClick={() => {
                  setMenuOpen((v) => !v);
                  setReactOpen(false);
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                aria-label="More actions"
              >
                <MoreHorizontal className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
        {!readOnly && !isDeleted && !editing && menuOpen && (
          <>
            <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMenuOpen(false)} />
            <div className="fixed bottom-4 left-1/2 z-50 w-[min(16rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] py-1 shadow-lg md:hidden">
              {onReply && (
                <button
                  type="button"
                  onClick={() => {
                    onReply(message);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--surface-hover)]"
                >
                  <Reply className="h-3.5 w-3.5" /> Reply
                </button>
              )}
              {onForward && !isDeleted && (
                <button
                  type="button"
                  onClick={() => {
                    onForward(message);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--surface-hover)]"
                >
                  <Forward className="h-3.5 w-3.5" /> Forward
                </button>
              )}
              {canModify && onEdit && message.body && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(true);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--surface-hover)]"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
              )}
              {onPin && (
                <button
                  type="button"
                  onClick={() => {
                    onPin(message.id, !isPinned);
                    setMenuOpen(false);
                  }}
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
      </div>
    </div>
  );
}
