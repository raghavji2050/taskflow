"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Forward, MoreHorizontal, Pencil, Pin, Reply, Smile, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn, getAvatarColorClasses, getInitials } from "@/lib/utils";
import { ReactionPicker } from "@/components/chat/EmojiPicker";
import { RichMessageRenderer } from "@/components/chat/RichMessageRenderer";
import { PresenceAvatar } from "@/components/chat/PresenceAvatar";
import type { MessageReceiptStatus } from "@/lib/chat-receipts";
import { MessageAttachmentPreview } from "@/components/chat/MessageAttachmentPreview";
import { MessageReceiptTicks } from "@/components/chat/MessageReceiptTicks";
import { DocumentShareCard, type SharedDocumentPreview } from "@/components/chat/DocumentShareCard";
import { MessageLinkPreview } from "@/components/chat/MessageLinkPreview";
import { MomShareCard } from "@/components/chat/MomShareCard";
import { ForwardedMessageCard } from "@/components/chat/ForwardedMessageCard";
import type { SharedMomPreview } from "@/lib/mom-format";
import type { FormattedForwardedFrom } from "@/lib/message-format";
import { isAttachmentOnlyBody } from "@/lib/attachments";
import { emojiOnlySizeClass, isEmojiOnlyMessage } from "@/lib/chat-emoji";
import { isDefaultDocumentShareBody, isMomShareBody } from "@/lib/document-ui";
import { copyTextToClipboard, getMessageCopyText } from "@/lib/chat-copy";
import { canEditMessage } from "@/lib/message-edit";
import { useMediaQuery } from "@/lib/use-visual-viewport";

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
  onStartEdit?: (message: ChatMessage) => void;
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

function MessageActionMenuItems({
  canCopy,
  onCopy,
  onReply,
  onForward,
  canModify,
  canEdit,
  onStartEdit,
  onPin,
  isPinned,
  onDelete,
  message,
  isDeleted,
  closeMenu,
}: {
  canCopy: boolean;
  onCopy: () => void;
  onReply?: (message: ChatMessage) => void;
  onForward?: (message: ChatMessage) => void;
  canModify: boolean;
  canEdit: boolean;
  onStartEdit?: (message: ChatMessage) => void;
  onPin?: (messageId: string, pinned: boolean) => void;
  isPinned: boolean;
  onDelete?: () => void;
  message: ChatMessage;
  isDeleted: boolean;
  closeMenu: () => void;
}) {
  const itemClass =
    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--surface-hover)]";

  return (
    <>
      {canCopy && (
        <button type="button" onClick={onCopy} className={itemClass}>
          <Copy className="h-3.5 w-3.5" /> Copy
        </button>
      )}
      {onReply && (
        <button
          type="button"
          onClick={() => {
            onReply(message);
            closeMenu();
          }}
          className={itemClass}
        >
          <Reply className="h-3.5 w-3.5" /> Reply
        </button>
      )}
      {onForward && !isDeleted && (
        <button
          type="button"
          onClick={() => {
            onForward(message);
            closeMenu();
          }}
          className={itemClass}
        >
          <Forward className="h-3.5 w-3.5" /> Forward
        </button>
      )}
      {canEdit && onStartEdit && (
        <button
          type="button"
          onClick={() => {
            onStartEdit(message);
            closeMenu();
          }}
          className={itemClass}
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
      )}
      {onPin && (
        <button
          type="button"
          onClick={() => {
            onPin(message.id, !isPinned);
            closeMenu();
          }}
          className={itemClass}
        >
          <Pin className="h-3.5 w-3.5" /> {isPinned ? "Unpin" : "Pin"}
        </button>
      )}
      {canModify && onDelete && (
        <button
          type="button"
          onClick={() => void onDelete()}
          className={cn(itemClass, "text-red-500 hover:bg-red-500/10")}
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      )}
    </>
  );
}

export function MessageBubble({
  message,
  isOwn,
  currentUserId,
  readOnly,
  onReply,
  onReact,
  onPin,
  onStartEdit,
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
  const [menuMounted, setMenuMounted] = useState(false);
  const [desktopMenuStyle, setDesktopMenuStyle] = useState<{
    top: number;
    left: number;
    transform?: string;
  }>({ top: 0, left: 0 });
  const desktopMenuButtonRef = useRef<HTMLButtonElement>(null);
  const desktopReactButtonRef = useRef<HTMLButtonElement>(null);
  const mobileReactButtonRef = useRef<HTMLButtonElement>(null);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const reactAnchorRef = isMobile ? mobileReactButtonRef : desktopReactButtonRef;

  useEffect(() => setMenuMounted(true), []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  useLayoutEffect(() => {
    if (!menuOpen || isMobile || !desktopMenuButtonRef.current) return;

    const rect = desktopMenuButtonRef.current.getBoundingClientRect();
    const menuWidth = 144;
    const menuHeight = 220;
    const gap = 8;
    const padding = 8;
    const vw = window.innerWidth;

    let left = isOwn ? rect.right - menuWidth : rect.left;
    left = Math.max(padding, Math.min(left, vw - menuWidth - padding));

    let top = rect.bottom + gap;
    let transform: string | undefined;

    if (isOwn) {
      top = rect.top - gap;
      transform = "translateY(-100%)";
      if (top - menuHeight < padding) {
        top = rect.bottom + gap;
        transform = undefined;
      }
    } else if (top + menuHeight > window.innerHeight - padding) {
      top = rect.top - gap;
      transform = "translateY(-100%)";
    }

    setDesktopMenuStyle({ top, left, transform });
  }, [menuOpen, isOwn, isMobile]);

  const isDeleted = Boolean(message.deletedAt);
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const reactionGroups = groupReactions(message.reactions, currentUserId);
  const isPinned = Boolean(message.pinnedAt);
  const canModify = isOwn && !isDeleted && !readOnly;
  const canEdit = canEditMessage(message, currentUserId, { readOnly });
  const copyText = getMessageCopyText(message.body, message.bodyJson);
  const canCopy = !isDeleted && copyText.length > 0;
  const showMessageActions = !isDeleted && (!readOnly || canCopy);

  const handleCopy = async () => {
    if (!canCopy) return;
    setMenuOpen(false);
    const ok = await copyTextToClipboard(copyText);
    if (ok) toast.success("Copied to clipboard");
    else toast.error("Could not copy message");
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
    !isDeleted;
  const hasBubbleContent =
    isDeleted ||
    Boolean(message.parent) ||
    Boolean(message.forwardedFrom) ||
    Boolean(message.sharedDocument) ||
    Boolean(message.sharedMom) ||
    showBody;
  const attachmentsInBubble = hasAttachments && hasBubbleContent;
  const attachmentsStandalone = hasAttachments && !hasBubbleContent;

  const isEmojiSticker =
    showBody &&
    !message.parent &&
    !message.forwardedFrom &&
    !message.sharedDocument &&
    !message.sharedMom &&
    !hasAttachments &&
    !isDeleted &&
    isEmojiOnlyMessage(message.body);
  const emojiSizeClass = isEmojiSticker ? emojiOnlySizeClass(message.body) : undefined;

  const closeMenu = () => setMenuOpen(false);

  const menuItems = (
    <MessageActionMenuItems
      canCopy={canCopy}
      onCopy={() => void handleCopy()}
      onReply={onReply}
      onForward={onForward}
      canModify={canModify}
      canEdit={canEdit}
      onStartEdit={onStartEdit}
      onPin={onPin}
      isPinned={isPinned}
      onDelete={handleDelete}
      message={message}
      isDeleted={isDeleted}
      closeMenu={closeMenu}
    />
  );

  const desktopMenu =
    menuOpen && menuMounted && !isMobile
      ? createPortal(
          <>
            <div
              className="fixed inset-0 z-[200]"
              onClick={closeMenu}
              aria-hidden="true"
            />
            <div
              className="fixed z-[201] min-w-[9rem] rounded-lg border border-[var(--card-border)] bg-[var(--card)] py-1 shadow-lg"
              style={{
                top: desktopMenuStyle.top,
                left: desktopMenuStyle.left,
                transform: desktopMenuStyle.transform,
              }}
              role="menu"
            >
              {menuItems}
            </div>
          </>,
          document.body
        )
      : null;

  const mobileMenu =
    menuOpen && menuMounted && isMobile
      ? createPortal(
          <div className="fixed inset-0 z-[250] flex flex-col justify-end" role="presentation">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
              onClick={closeMenu}
              aria-hidden="true"
            />
            <div
              className="relative z-10 rounded-t-2xl border-t border-[var(--border)] bg-[var(--card)] py-1 shadow-lg safe-bottom"
              role="menu"
            >
              <div className="mx-auto mb-2 mt-2 h-1 w-10 rounded-full bg-[var(--border)]" />
              {menuItems}
            </div>
          </div>,
          document.body
        )
      : null;

  const reactionPicker =
    reactOpen && onReact ? (
      <ReactionPicker
        anchorRef={reactAnchorRef}
        onSelect={(emoji) => onReact(message.id, emoji)}
        onClose={() => setReactOpen(false)}
        align={isOwn ? "end" : "start"}
        side={isOwn ? "top" : "bottom"}
      />
    ) : null;

  return (
    <div
      className={cn(
        "group flex w-full min-w-0 max-w-full animate-message-in px-0 sm:px-1",
        isOwn ? "justify-end" : "justify-start",
        !isLastInGroup && "mb-0.5",
        isLastInGroup && "mb-2"
      )}
    >
      <div
        className={cn(
          "flex w-max min-w-0 max-w-[min(92%,calc(100vw-1rem))] sm:max-w-[88%] md:max-w-[85%]",
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
            "flex h-8 w-8 shrink-0 self-start items-center justify-center overflow-hidden rounded-full text-xs font-semibold",
            !message.user.image && getAvatarColorClasses(message.user.name)
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

      <div
        className={cn(
          "relative flex min-w-0 flex-col",
          isOwn ? "items-end" : "items-start"
        )}
      >
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

        <div className="relative flex w-fit min-w-0 max-w-full flex-col">
          {hasBubbleContent && (
          <div
            className={cn(
              "max-w-full break-words rounded-2xl text-sm leading-relaxed [overflow-wrap:anywhere]",
              isEmojiSticker
                ? "border-0 bg-transparent px-0.5 py-0.5 shadow-none"
                : "px-3 py-2",
              !isEmojiSticker &&
                (isDeleted
                  ? "rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-hover)]/50 italic text-[var(--muted)]"
                  : isOwn
                    ? "rounded-tr-md bg-[var(--accent)] text-white"
                    : "rounded-tl-md border border-[var(--border)] bg-[var(--surface-2)] text-[var(--foreground)]")
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
                    mentionClassName={isOwn && !isEmojiSticker ? "text-white bg-white/15" : undefined}
                    linkClassName={isOwn && !isEmojiSticker ? "text-white underline" : undefined}
                    inOwnBubble={isOwn && !isEmojiSticker}
                    emojiOnly={isEmojiSticker}
                    emojiSizeClass={emojiSizeClass}
                    className={isEmojiSticker ? "leading-none" : undefined}
                  />
                )}

                {!message.forwardedFrom && message.sharedDocument && !isDeleted && (
                  <DocumentShareCard document={message.sharedDocument} isOwn={isOwn} />
                )}

                {!message.forwardedFrom && message.sharedMom && !isDeleted && (
                  <MomShareCard mom={message.sharedMom} isOwn={isOwn} />
                )}

                {!message.forwardedFrom &&
                  !isDeleted &&
                  !message.sharedDocument &&
                  !message.sharedMom &&
                  showBody && (
                    <MessageLinkPreview
                      body={message.body}
                      bodyJson={message.bodyJson}
                      attachmentUrls={message.attachments?.map((a) => a.url)}
                      isOwn={isOwn}
                    />
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

          {showMessageActions && (
            <div
              className={cn(
                "relative hidden gap-0.5 md:flex",
                "md:absolute md:top-1/2 md:-translate-y-1/2 md:opacity-0 md:transition-opacity md:group-hover:opacity-100",
                (menuOpen || reactOpen) && "md:!opacity-100",
                isOwn
                  ? "md:left-0 md:-translate-x-[calc(100%+0.5rem)] md:-translate-y-1/2"
                  : "md:right-0 md:translate-x-[calc(100%+0.5rem)] md:-translate-y-1/2 md:justify-end"
              )}
            >
              {!readOnly && (
              <div className="relative">
                <button
                  ref={desktopReactButtonRef}
                  type="button"
                  onClick={() => { setReactOpen((v) => !v); setMenuOpen(false); }}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--card-border)] bg-[var(--card)] text-[var(--muted)] shadow-sm hover:text-[var(--foreground)]"
                  aria-label="React"
                >
                  <Smile className="h-3.5 w-3.5" />
                </button>
              </div>
              )}
              <button
                ref={desktopMenuButtonRef}
                type="button"
                onClick={() => { setMenuOpen((v) => !v); setReactOpen(false); }}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--card-border)] bg-[var(--card)] text-[var(--muted)] shadow-sm hover:text-[var(--foreground)]"
                aria-label="More actions"
                aria-expanded={menuOpen}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {desktopMenu}
          {mobileMenu}
          {reactionPicker}
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
          {showMessageActions && (
            <div className="ml-0.5 inline-flex items-center gap-0.5 md:hidden">
              {!readOnly && (
              <div className="relative">
                <button
                  ref={mobileReactButtonRef}
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
              </div>
              )}
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
      </div>
    </div>
    </div>
  );
}
