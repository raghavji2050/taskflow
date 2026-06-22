"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, Plus, Send, Smile, X, ClipboardList } from "lucide-react";
import { MentionInput, type MentionInputHandle } from "@/components/MentionInput";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import { ChatFileDropOverlay } from "@/components/chat/ChatFileDropOverlay";
import { Button } from "@/components/ui/Button";
import { isImageAttachment } from "@/lib/attachments";
import { chatFileKey, mergeChatUploadFiles, useFileDragDrop } from "@/lib/chat-file-drop";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/use-visual-viewport";
import type { ChatMessage } from "@/components/chat/MessageBubble";

interface Member {
  id: string;
  name: string;
}

interface ChatComposerProps {
  body: string;
  onBodyChange: (value: string) => void;
  onSend: (opts?: { files?: File[] }) => void;
  onTyping?: () => void;
  readOnly?: boolean;
  members?: Member[];
  showMentions?: boolean;
  currentUserId?: string;
  replyTo?: ChatMessage | null;
  onCancelReply?: () => void;
  onOpenMom?: () => void;
  pendingFiles: File[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (file: File) => void;
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

export function ChatComposer({
  body,
  onBodyChange,
  onSend,
  onTyping,
  readOnly,
  members = [],
  showMentions,
  currentUserId,
  replyTo,
  onCancelReply,
  onOpenMom,
  pendingFiles,
  onAddFiles,
  onRemoveFile,
}: ChatComposerProps) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<MentionInputHandle>(null);
  const isMobile = useMediaQuery("(max-width: 767px)");

  const canSend = Boolean(body.trim() || pendingFiles.length > 0) && !readOnly;
  const composerDisabled = readOnly;

  const { isDragging, dragHandlers } = useFileDragDrop({
    disabled: composerDisabled,
    onFiles: onAddFiles,
  });

  useEffect(() => {
    if (!replyTo) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [replyTo?.id]);

  const handleSend = () => {
    if (!canSend) return;
    onSend({ files: pendingFiles.length > 0 ? pendingFiles : undefined });
    if (fileRef.current) fileRef.current.value = "";
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleBodyChange = (value: string) => {
    if (composerDisabled) return;
    onBodyChange(value);
    onTyping?.();
  };

  if (readOnly) {
    return (
      <p className="text-center text-xs text-[var(--muted)]">You can view but not send messages</p>
    );
  }

  return (
    <div
      className={cn("relative space-y-2", isDragging && "cursor-copy")}
      {...dragHandlers}
    >
      {isDragging && <ChatFileDropOverlay />}
      {replyTo && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] px-3 py-2">
          <div className="min-w-0 flex-1 border-l-2 border-[var(--accent)] pl-2">
            <p className="text-[10px] font-semibold text-[var(--accent)]">
              Replying to {replyTo.user.name}
            </p>
            <p className="truncate text-xs text-[var(--muted)]">{replyTo.body}</p>
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

      {pendingFiles.length > 0 && (
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

      <div className="relative flex min-w-0 flex-1 items-end gap-1 rounded-3xl surface-panel border border-[var(--border)] p-1.5 md:gap-2 md:p-2">
        <div className="relative shrink-0 md:hidden">
          <button
            type="button"
            disabled={composerDisabled}
            onClick={() => setExtrasOpen((v) => !v)}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="More options"
            aria-expanded={extrasOpen}
          >
            <Plus className={cn("h-4 w-4 transition-transform", extrasOpen && "rotate-45")} />
          </button>
          {extrasOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setExtrasOpen(false)} />
              <div className="absolute bottom-full left-0 z-50 mb-1 flex items-center gap-0.5 rounded-xl surface-panel border border-[var(--border)] p-1 shadow-[var(--shadow-sm)]">
                <button
                  type="button"
                  disabled={composerDisabled}
                  onClick={() => {
                    setExtrasOpen(false);
                    setEmojiOpen(true);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                  aria-label="Add emoji"
                >
                  <Smile className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={composerDisabled}
                  onClick={() => {
                    setExtrasOpen(false);
                    fileRef.current?.click();
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                  aria-label="Attach file"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                {onOpenMom && (
                  <button
                    type="button"
                    disabled={composerDisabled}
                    onClick={() => {
                      setExtrasOpen(false);
                      onOpenMom();
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                    aria-label="Create minutes of meeting"
                  >
                    <ClipboardList className="h-4 w-4" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="relative hidden shrink-0 gap-0.5 md:flex">
          <button
            type="button"
            disabled={composerDisabled}
            onClick={() => setEmojiOpen((v) => !v)}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50 md:h-10 md:w-10"
            aria-label="Add emoji"
          >
            <Smile className="h-4 w-4 md:h-5 md:w-5" />
          </button>
          <button
            type="button"
            disabled={composerDisabled}
            onClick={() => fileRef.current?.click()}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50 md:h-10 md:w-10"
            aria-label="Attach file"
          >
            <Paperclip className="h-4 w-4 md:h-5 md:w-5" />
          </button>
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
        </div>

        {emojiOpen && (
          <EmojiPicker
            onSelect={(emoji) => onBodyChange(body + emoji)}
            onClose={() => setEmojiOpen(false)}
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

        <MentionInput
          ref={inputRef}
          value={body}
          onChange={handleBodyChange}
          onSubmit={handleSend}
          disabled={composerDisabled}
          members={showMentions ? members : []}
          currentUserId={currentUserId}
          placeholder={
            isMobile
              ? "Message…"
              : showMentions
                ? "Type a message… Use @ to mention"
                : "Type a message… Drag files here to attach"
          }
          className="min-h-[2.25rem] flex-1 rounded-2xl border-0 bg-transparent px-2.5 py-2 text-sm focus:outline-none md:min-h-[2.5rem] md:px-3"
        />

        <Button
          variant="primary"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleSend}
          disabled={!canSend}
          className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full p-0 md:h-10 md:w-10"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
