"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Theme } from "emoji-picker-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const EmojiPickerLib = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[22rem] w-[min(20rem,calc(100vw-3rem))] items-center justify-center rounded-xl surface-panel border border-[var(--border)] text-xs text-[var(--muted)] md:w-80">
      Loading emojis…
    </div>
  ),
});

/** Compact strip for message reactions. */
export const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥", "👀", "✅", "🙏", "😮", "😢"];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const theme =
    mounted && resolvedTheme === "dark" ? Theme.DARK : Theme.LIGHT;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div className="absolute bottom-full left-0 z-50 mb-2 overflow-hidden rounded-xl border border-[var(--border)] shadow-[var(--shadow-sm)]">
        <EmojiPickerLib
          onEmojiClick={(data) => {
            onSelect(data.emoji);
            onClose();
          }}
          theme={theme}
          width={320}
          height={352}
          lazyLoadEmojis
          searchPlaceholder="Search emojis…"
          previewConfig={{ showPreview: false }}
        />
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
