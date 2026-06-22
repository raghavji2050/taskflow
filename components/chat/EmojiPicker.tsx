"use client";

import { cn } from "@/lib/utils";

export const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥", "👀", "✅", "🙏", "😮", "😢"];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div className="absolute bottom-full left-0 z-50 mb-2 grid w-[min(14rem,calc(100vw-4rem))] grid-cols-5 gap-1 rounded-xl surface-panel border border-[var(--border)] p-2 shadow-[var(--shadow-sm)] md:w-56">
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              onSelect(emoji);
              onClose();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-lg hover:bg-[var(--surface-hover)]"
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  );
}

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function ReactionPicker({ onSelect, onClose }: ReactionPickerProps) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div
        className={cn(
          "z-50 flex max-w-[calc(100vw-2rem)] gap-0.5 overflow-x-auto rounded-full surface-panel border border-[var(--border)] px-2 py-1 shadow-[var(--shadow-sm)]",
          "max-md:fixed max-md:bottom-4 max-md:left-1/2 max-md:-translate-x-1/2",
          "md:absolute md:top-full md:mt-1 md:max-w-none md:overflow-visible"
        )}
      >
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              onSelect(emoji);
              onClose();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full text-base hover:bg-[var(--surface-hover)]"
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  );
}
