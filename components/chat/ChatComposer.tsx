"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Clock, Film, Paperclip, Plus, Send, Smile, X, ClipboardList, Pencil } from "lucide-react";
import {
  RichMessageEditor,
  type RichMessageEditorHandle,
} from "@/components/chat/RichMessageEditor";
import { RichMessageRenderer } from "@/components/chat/RichMessageRenderer";
import { ChatMediaPicker } from "@/components/chat/ChatMediaPicker";
import type { SelectedGif } from "@/components/chat/GifPicker";
import { ChatFileDropOverlay } from "@/components/chat/ChatFileDropOverlay";
import { ScheduleButton } from "@/components/chat/ScheduleButton";
import { ComposerLinkPreview } from "@/components/chat/MessageLinkPreview";
import { isImageAttachment } from "@/lib/attachments";
import { chatFileKey, useFileDragDrop } from "@/lib/chat-file-drop";
import type { RichMessageDoc } from "@/lib/rich-message-types";
import { plainTextToRichDoc } from "@/lib/rich-message-types";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/use-visual-viewport";
import type { ChatMessage } from "@/components/chat/MessageBubble";

interface Member {
  id: string;
  name: string;
  image?: string | null;
  email?: string;
}

interface ChatComposerProps {
  body: string;
  bodyJson: RichMessageDoc | null;
  onBodyChange: (value: { body: string; bodyJson: RichMessageDoc | null }) => void;
  onSend: (opts?: { files?: File[] }) => void;
  onSchedule?: () => void;
  onTyping?: () => void;
  readOnly?: boolean;
  members?: Member[];
  showMentions?: boolean;
  currentUserId?: string;
  replyTo?: ChatMessage | null;
  onCancelReply?: () => void;
  editingMessage?: ChatMessage | null;
  onCancelEdit?: () => void;
  onOpenMom?: () => void;
  onSendGif?: (gif: SelectedGif) => void;
  pendingFiles: File[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (file: File) => void;
  conversationId?: string;
  allowTagAll?: boolean;
}

function PendingFileChip({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImageAttachment(file.type)) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="flex min-w-[140px] max-w-[200px] items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 text-xs">
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
      ) : (
        <Paperclip className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
      )}
      <span className="min-w-0 flex-1 truncate">{file.name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 text-[var(--muted)] hover:text-[var(--foreground)]"
        aria-label={`Remove ${file.name}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ComposerExtraAction({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-hover)] disabled:pointer-events-none disabled:opacity-40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-hover)] text-[var(--muted)] [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </span>
      {label}
    </button>
  );
}

export function ChatComposer({
  body,
  bodyJson,
  onBodyChange,
  onSend,
  onSchedule,
  onTyping,
  readOnly,
  members = [],
  showMentions,
  currentUserId,
  replyTo,
  onCancelReply,
  editingMessage,
  onCancelEdit,
  onOpenMom,
  onSendGif,
  pendingFiles,
  onAddFiles,
  onRemoveFile,
  conversationId,
  allowTagAll = false,
}: ChatComposerProps) {
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerTab, setMediaPickerTab] = useState<"emoji" | "gif">("emoji");
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const fileRef = useRef<HTMLInputElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<RichMessageEditorHandle>(null);

  const isEditing = Boolean(editingMessage);
  const canSend = Boolean(body.trim() || (!isEditing && pendingFiles.length > 0)) && !readOnly;
  const canSchedule = canSend && Boolean(onSchedule) && !isEditing;
  const composerDisabled = readOnly;
  const editorInitialContent = isEditing
    ? (bodyJson ?? plainTextToRichDoc(body || editingMessage!.body))
    : undefined;
  const editorKey = isEditing
    ? `edit-${editingMessage!.id}`
    : (conversationId ?? "composer");

  const { isDragging, dragHandlers } = useFileDragDrop({
    disabled: composerDisabled,
    onFiles: onAddFiles,
  });

  useEffect(() => {
    if (!replyTo && !editingMessage) return;
    const id = requestAnimationFrame(() => editorRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [replyTo?.id, editingMessage?.id]);

  useEffect(() => setMenuMounted(true), []);

  useEffect(() => {
    if (!extrasOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExtrasOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [extrasOpen]);

  const closeExtras = () => setExtrasOpen(false);

  const openMediaPicker = (tab: "emoji" | "gif") => {
    setMediaPickerTab(tab);
    setMediaPickerOpen(true);
  };

  const mobileExtrasSheet =
    extrasOpen && isMobile && menuMounted
      ? createPortal(
          <div className="fixed inset-0 z-[250] flex flex-col justify-end" role="presentation">
            <div
              className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
              onClick={closeExtras}
              aria-hidden="true"
            />
            <div
              className="relative z-10 overflow-hidden rounded-t-2xl border-t border-[var(--border)] bg-[var(--card)] safe-bottom"
              role="menu"
            >
              <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[var(--border)]" />
              <ComposerExtraAction
                label="Emoji"
                icon={<Smile />}
                onClick={() => {
                  closeExtras();
                  openMediaPicker("emoji");
                }}
              />
              {onSendGif && !isEditing && (
                <ComposerExtraAction
                  label="GIF"
                  icon={<Film />}
                  onClick={() => {
                    closeExtras();
                    openMediaPicker("gif");
                  }}
                />
              )}
              {!isEditing && (
                <ComposerExtraAction
                  label="Attach file"
                  icon={<Paperclip />}
                  onClick={() => {
                    closeExtras();
                    fileRef.current?.click();
                  }}
                />
              )}
              {onOpenMom && (
                <ComposerExtraAction
                  label="Minutes of meeting"
                  icon={<ClipboardList />}
                  onClick={() => {
                    closeExtras();
                    onOpenMom();
                  }}
                />
              )}
              {onSchedule && !isEditing && (
                <ComposerExtraAction
                  label="Schedule message"
                  icon={<Clock />}
                  disabled={!canSchedule}
                  onClick={() => {
                    closeExtras();
                    onSchedule();
                  }}
                />
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  const handleSend = () => {
    if (!canSend) return;
    onSend({ files: !isEditing && pendingFiles.length > 0 ? pendingFiles : undefined });
    if (!isEditing) {
      editorRef.current?.clear();
      if (fileRef.current) fileRef.current.value = "";
    }
    requestAnimationFrame(() => editorRef.current?.focus());
  };

  if (readOnly) {
    return (
      <p className="text-center text-xs text-[var(--muted)]">You can view but not send messages</p>
    );
  }

  return (
    <div
      className={cn("relative w-full min-w-0 max-w-full space-y-2", isDragging && "cursor-copy")}
      {...dragHandlers}
    >
      {isDragging && <ChatFileDropOverlay />}
      {editingMessage && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] px-3 py-2">
          <div className="min-w-0 flex-1 border-l-2 border-amber-500 pl-2">
            <p className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              <Pencil className="h-3 w-3" />
              Editing message
            </p>
            <div className="truncate text-xs text-[var(--muted)]">
              <RichMessageRenderer
                body={editingMessage.body}
                bodyJson={editingMessage.bodyJson}
                inline
                className="truncate"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={onCancelEdit}
            className="shrink-0 rounded p-1 text-[var(--muted)] hover:bg-[var(--card)]"
            aria-label="Cancel edit"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {replyTo && !editingMessage && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] px-3 py-2">
          <div className="min-w-0 flex-1 border-l-2 border-[var(--accent)] pl-2">
            <p className="text-[10px] font-semibold text-[var(--accent)]">
              Replying to {replyTo.user.name}
            </p>
            <div className="truncate text-xs text-[var(--muted)]">
              <RichMessageRenderer
                body={replyTo.body}
                bodyJson={replyTo.bodyJson}
                inline
                className="truncate"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="shrink-0 rounded p-1 text-[var(--muted)] hover:bg-[var(--card)]"
            aria-label="Cancel reply"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {pendingFiles.length > 0 && !isEditing && (
        <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-hover)]/50 p-2">
          {pendingFiles.map((file) => (
            <PendingFileChip
              key={chatFileKey(file)}
              file={file}
              onRemove={() => onRemoveFile(file)}
            />
          ))}
        </div>
      )}

      {body.trim() && !isEditing && (
        <ComposerLinkPreview body={body} bodyJson={bodyJson} />
      )}

      <div className="relative flex w-full min-w-0 max-w-full items-center gap-0.5 rounded-3xl surface-panel border border-[var(--border)] p-1 sm:gap-1 sm:p-1.5 md:gap-2 md:p-2">
        <div className="relative shrink-0 md:hidden">
          <button
            type="button"
            disabled={composerDisabled}
            onClick={() => setExtrasOpen((v) => !v)}
            className={cn(
              "flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 sm:w-8",
              extrasOpen && "bg-[var(--surface-hover)] text-[var(--foreground)]"
            )}
            aria-label="More options"
            aria-expanded={extrasOpen}
          >
            <Plus className={cn("h-4 w-4 transition-transform", extrasOpen && "rotate-45")} />
          </button>
        </div>
        {mobileExtrasSheet}

        <div className="relative hidden shrink-0 items-center gap-0.5 md:flex">
          <button
            ref={emojiButtonRef}
            type="button"
            disabled={composerDisabled}
            onClick={() => openMediaPicker("emoji")}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50 md:h-10 md:w-10"
            aria-label="Add emoji or GIF"
          >
            <Smile className="h-4 w-4 md:h-5 md:w-5" />
          </button>
          {onSendGif && !isEditing && (
            <button
              type="button"
              disabled={composerDisabled}
              onClick={() => openMediaPicker("gif")}
              className="hidden h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50 md:flex md:h-10 md:w-10"
              aria-label="Send GIF"
            >
              <Film className="h-4 w-4 md:h-5 md:w-5" />
            </button>
          )}
          {!isEditing && (
          <button
            type="button"
            disabled={composerDisabled}
            onClick={() => fileRef.current?.click()}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50 md:h-10 md:w-10"
            aria-label="Attach file"
          >
            <Paperclip className="h-4 w-4 md:h-5 md:w-5" />
          </button>
          )}
          {onOpenMom && (
            <button
              type="button"
              disabled={composerDisabled}
              onClick={onOpenMom}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50 md:h-10 md:w-10"
              aria-label="Create minutes of meeting"
              title="Minutes of meeting"
            >
              <ClipboardList className="h-4 w-4 md:h-5 md:w-5" />
            </button>
          )}
          {onSchedule && !isEditing && <ScheduleButton disabled={!canSchedule} onClick={onSchedule} />}
        </div>

        {mediaPickerOpen && (
          <ChatMediaPicker
            anchorRef={isMobile ? undefined : emojiButtonRef}
            initialTab={mediaPickerTab}
            onEmojiSelect={(emoji) => editorRef.current?.insertEmoji(emoji)}
            onGifSelect={(gif) => onSendGif?.(gif)}
            onClose={() => setMediaPickerOpen(false)}
          />
        )}

        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          disabled={composerDisabled}
          onChange={(e) => {
            onAddFiles([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />

        <RichMessageEditor
          key={editorKey}
          editorKey={editorKey}
          ref={editorRef}
          bodyJson={bodyJson}
          initialContent={editorInitialContent}
          onChange={onBodyChange}
          onSubmit={handleSend}
          onTyping={onTyping}
          disabled={composerDisabled}
          members={showMentions ? members : []}
          currentUserId={currentUserId}
          allowTagAll={showMentions && allowTagAll}
          placeholder={isEditing ? "Edit message" : "Type a message"}
          showToolbar={false}
          className="min-h-[2rem] min-w-0 flex-1 basis-0 self-center overflow-hidden rounded-2xl border-0 bg-transparent px-1.5 py-1 text-sm sm:min-h-[2.25rem] sm:px-2.5 sm:py-1.5 md:min-h-[2.5rem] md:px-3 md:py-2"
        />

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleSend}
          disabled={!canSend}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] p-0 text-white shadow-sm transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9 md:h-10 md:w-10"
          aria-label={isEditing ? "Save changes" : "Send message"}
        >
          {isEditing ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
