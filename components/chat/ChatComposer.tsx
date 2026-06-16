"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, Send, Smile, X } from "lucide-react";
import { MentionInput, type MentionInputHandle } from "@/components/MentionInput";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import { Button } from "@/components/ui/Button";
import { isImageAttachment } from "@/lib/attachments";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/components/chat/MessageBubble";

interface Member {
  id: string;
  name: string;
}

interface ChatComposerProps {
  body: string;
  onBodyChange: (value: string) => void;
  onSend: (opts?: { file?: File | null }) => void;
  onTyping?: () => void;
  sending?: boolean;
  readOnly?: boolean;
  members?: Member[];
  showMentions?: boolean;
  currentUserId?: string;
  replyTo?: ChatMessage | null;
  onCancelReply?: () => void;
}

export function ChatComposer({
  body,
  onBodyChange,
  onSend,
  onTyping,
  sending,
  readOnly,
  members = [],
  showMentions,
  currentUserId,
  replyTo,
  onCancelReply,
}: ChatComposerProps) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<MentionInputHandle>(null);
  const prevSendingRef = useRef(false);

  const canSend = Boolean(body.trim() || pendingFile) && !sending && !readOnly;
  const composerDisabled = sending || readOnly;

  useEffect(() => {
    if (sending) setEmojiOpen(false);
  }, [sending]);

  useEffect(() => {
    if (prevSendingRef.current && !sending && !readOnly) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    prevSendingRef.current = Boolean(sending);
  }, [sending, readOnly]);

  useEffect(() => {
    if (!replyTo) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [replyTo?.id]);

  useEffect(() => {
    if (!pendingFile || !isImageAttachment(pendingFile.type)) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  const handleSend = () => {
    if (!canSend) return;
    onSend({ file: pendingFile });
    setPendingFile(null);
    if (fileRef.current) fileRef.current.value = "";
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
    <div className="space-y-2">
      {replyTo && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--surface-hover)] px-3 py-2">
          <div className="min-w-0 flex-1 border-l-2 border-[var(--accent)] pl-2">
            <p className="text-[10px] font-semibold text-[var(--accent)]">
              Replying to {replyTo.user.name}
            </p>
            <p className="truncate text-xs text-[var(--muted)]">{replyTo.body}</p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            disabled={sending}
            className="shrink-0 rounded p-1 text-[var(--muted)] hover:bg-[var(--card)] disabled:opacity-50"
            aria-label="Cancel reply"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {pendingFile && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-xs">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
          ) : (
            <Paperclip className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
          )}
          <span className="min-w-0 flex-1 truncate pt-0.5">{pendingFile.name}</span>
          <button
            type="button"
            onClick={() => setPendingFile(null)}
            disabled={sending}
            className="text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-1.5 md:gap-2">
        <div className="relative flex shrink-0 gap-0.5">
          <button
            type="button"
            disabled={composerDisabled}
            onClick={() => setEmojiOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50 md:h-10 md:w-10"
            aria-label="Add emoji"
          >
            <Smile className="h-4 w-4 md:h-5 md:w-5" />
          </button>
          {emojiOpen && !sending && (
            <EmojiPicker
              onSelect={(emoji) => onBodyChange(body + emoji)}
              onClose={() => setEmojiOpen(false)}
            />
          )}
          <button
            type="button"
            disabled={composerDisabled}
            onClick={() => fileRef.current?.click()}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50 md:h-10 md:w-10"
            aria-label="Attach file"
          >
            <Paperclip className="h-4 w-4 md:h-5 md:w-5" />
          </button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            disabled={composerDisabled}
            onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <MentionInput
          ref={inputRef}
          value={body}
          onChange={handleBodyChange}
          onSubmit={handleSend}
          disabled={composerDisabled}
          members={showMentions ? members : []}
          currentUserId={currentUserId}
          placeholder={
            sending
              ? "Sending…"
              : showMentions
                ? "Type a message… Use @ to mention"
                : "Type a message…"
          }
          className={cn(
            "min-h-[2.5rem] flex-1 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm",
            sending && "opacity-60"
          )}
        />

        <Button
          onClick={handleSend}
          disabled={!canSend}
          isLoading={sending}
          className="relative h-9 w-9 shrink-0 overflow-hidden p-0 md:h-10 md:w-10"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
