"use client";

import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { Theme, EmojiStyle } from "emoji-picker-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/use-visual-viewport";

const EmojiPickerLib = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-48 w-full items-center justify-center rounded-xl text-xs text-[var(--muted)]">
      Loading emojis…
    </div>
  ),
});

/** Compact strip for message reactions. */
export const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥", "👀", "✅", "🙏", "😮", "😢"];

const PICKER_Z_BACKDROP = 250;
const PICKER_Z_PANEL = 251;

function useEmojiTheme() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return mounted && resolvedTheme === "dark" ? Theme.DARK : Theme.LIGHT;
}

function usePickerEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}

function computePickerPosition(
  rect: DOMRect,
  panelWidth: number,
  panelHeight: number,
  align: "start" | "end",
  side: "top" | "bottom"
) {
  const padding = 8;
  const gap = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = align === "end" ? rect.right - panelWidth : rect.left;
  left = Math.max(padding, Math.min(left, vw - panelWidth - padding));

  let top = side === "top" ? rect.top - panelHeight - gap : rect.bottom + gap;

  if (top + panelHeight > vh - padding) {
    top = rect.top - panelHeight - gap;
  }
  if (top < padding) {
    top = Math.max(padding, rect.bottom + gap);
  }
  top = Math.max(padding, Math.min(top, vh - panelHeight - padding));

  return { top, left };
}

function PickerBackdrop({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[250] bg-black/20"
      style={{ zIndex: PICKER_Z_BACKDROP }}
      onMouseDown={onClose}
      aria-hidden="true"
    />
  );
}

function QuickEmojiButton({
  emoji,
  onSelect,
  size = "md",
}: {
  emoji: string;
  onSelect: (emoji: string) => void;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(emoji)}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] shadow-sm transition-transform active:scale-90 hover:border-[color-mix(in_oklab,var(--accent)_40%,var(--border))] hover:bg-[var(--surface-hover)]",
        size === "sm" ? "h-9 w-9 text-lg" : "h-11 w-11 text-xl"
      )}
      aria-label={`React with ${emoji}`}
    >
      <span className="chat-emoji">{emoji}</span>
    </button>
  );
}

export function FullEmojiPanel({
  onSelect,
  onClose,
  width,
  height = 320,
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  width: number;
  height?: number;
}) {
  const theme = useEmojiTheme();

  return (
    <div className="chat-emoji-picker-panel">
      <EmojiPickerLib
        onEmojiClick={(data) => {
          onSelect(data.emoji);
          onClose();
        }}
        theme={theme}
        emojiStyle={EmojiStyle.GOOGLE}
        width={width}
        height={height}
        lazyLoadEmojis
        searchPlaceholder="Search emojis…"
        previewConfig={{ showPreview: false }}
      />
    </div>
  );
}

function useDesktopPickerPosition(
  anchorRef: RefObject<HTMLElement | null> | undefined,
  panelWidth: number,
  panelHeight: number,
  align: "start" | "end",
  side: "top" | "bottom",
  enabled: boolean
) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!enabled) {
      setPosition(null);
      return;
    }

    const update = () => {
      const rect = anchorRef?.current?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        setPosition(computePickerPosition(rect, panelWidth, panelHeight, align, side));
        return;
      }
      setPosition({
        top: Math.max(8, window.innerHeight - panelHeight - 88),
        left: Math.max(8, window.innerWidth - panelWidth - 24),
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, panelWidth, panelHeight, align, side, enabled]);

  return position;
}

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  anchorRef?: RefObject<HTMLElement | null>;
}

export function EmojiPicker({ onSelect, onClose, anchorRef }: EmojiPickerProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [mounted, setMounted] = useState(false);
  const [panelWidth, setPanelWidth] = useState(320);
  const [panelHeight, setPanelHeight] = useState(352);

  useEffect(() => setMounted(true), []);
  usePickerEscape(onClose);

  useEffect(() => {
    const update = () => {
      setPanelWidth(Math.min(352, Math.max(280, window.innerWidth - 24)));
      setPanelHeight(Math.min(352, Math.round(window.innerHeight * 0.45)));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const handleSelect = (emoji: string) => {
    onSelect(emoji);
    onClose();
  };

  const desktopPosition = useDesktopPickerPosition(
    anchorRef,
    320,
    352,
    "start",
    "top",
    !isMobile && mounted
  );

  if (!mounted) return null;

  if (isMobile) {
    return createPortal(
      <div className="fixed inset-0 flex flex-col justify-end" role="presentation" style={{ zIndex: PICKER_Z_BACKDROP }}>
        <PickerBackdrop onClose={onClose} />
        <div
          className="relative max-h-[min(85dvh,560px)] overflow-hidden rounded-t-2xl border-t border-[var(--border)] bg-[var(--card)] safe-bottom"
          style={{ zIndex: PICKER_Z_PANEL }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[var(--border)]" />
          <p className="px-4 pt-2 text-center text-xs font-medium text-[var(--muted)]">
            Pick a reaction
          </p>
          <div className="flex justify-center px-3 py-2">
            <FullEmojiPanel
              onSelect={handleSelect}
              onClose={onClose}
              width={panelWidth}
              height={panelHeight}
            />
          </div>
        </div>
      </div>,
      document.body
    );
  }

  if (!desktopPosition) {
    return createPortal(<PickerBackdrop onClose={onClose} />, document.body);
  }

  return createPortal(
    <>
      <PickerBackdrop onClose={onClose} />
      <div
        className="fixed overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-md)]"
        style={{ zIndex: PICKER_Z_PANEL, top: desktopPosition.top, left: desktopPosition.left }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <FullEmojiPanel onSelect={handleSelect} onClose={onClose} width={320} height={352} />
      </div>
    </>,
    document.body
  );
}

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  anchorRef?: RefObject<HTMLElement | null>;
  align?: "start" | "end";
  side?: "top" | "bottom";
}

export function ReactionPicker({
  onSelect,
  onClose,
  anchorRef,
  align = "start",
  side = "bottom",
}: ReactionPickerProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [mounted, setMounted] = useState(false);
  const [showFull, setShowFull] = useState(true);
  const [panelWidth, setPanelWidth] = useState(320);
  const [panelHeight, setPanelHeight] = useState(340);

  useEffect(() => setMounted(true), []);
  usePickerEscape(onClose);

  useEffect(() => {
    const update = () => {
      setPanelWidth(Math.min(352, Math.max(280, window.innerWidth - 24)));
      setPanelHeight(Math.min(340, Math.round(window.innerHeight * 0.45)));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const handleSelect = (emoji: string) => {
    onSelect(emoji);
    onClose();
  };

  const desktopPanelWidth = showFull ? 320 : 340;
  const desktopPanelHeight = showFull ? 380 : 56;
  const desktopPosition = useDesktopPickerPosition(
    anchorRef,
    desktopPanelWidth,
    desktopPanelHeight,
    align,
    side,
    !isMobile && mounted
  );

  const quickRow = (
    <div className="flex items-center gap-1.5 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {QUICK_EMOJIS.map((emoji) => (
        <QuickEmojiButton key={emoji} emoji={emoji} onSelect={handleSelect} size="sm" />
      ))}
      {!isMobile && (
        <button
          type="button"
          onClick={() => setShowFull((v) => !v)}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]",
            showFull && "border-[var(--accent)] text-[var(--accent)]"
          )}
          aria-label="More emojis"
          aria-expanded={showFull}
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  if (!mounted) return null;

  if (isMobile) {
    return createPortal(
      <div className="fixed inset-0 flex flex-col justify-end" role="presentation" style={{ zIndex: PICKER_Z_BACKDROP }}>
        <PickerBackdrop onClose={onClose} />
        <div
          className="relative max-h-[min(85dvh,600px)] overflow-y-auto rounded-t-2xl border-t border-[var(--border)] bg-[var(--card)] safe-bottom"
          style={{ zIndex: PICKER_Z_PANEL }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[var(--border)]" />
          <p className="px-4 pt-2 text-center text-xs font-medium text-[var(--muted)]">
            Add reaction
          </p>
          <div className="px-3 py-2">{quickRow}</div>
          <div className="flex justify-center border-t border-[var(--border)] px-2 pb-3 pt-2">
            <FullEmojiPanel
              onSelect={handleSelect}
              onClose={onClose}
              width={panelWidth}
              height={panelHeight}
            />
          </div>
        </div>
      </div>,
      document.body
    );
  }

  if (!desktopPosition) {
    return createPortal(<PickerBackdrop onClose={onClose} />, document.body);
  }

  return createPortal(
    <>
      <PickerBackdrop onClose={onClose} />
      <div
        className="fixed rounded-2xl surface-panel border border-[var(--border)] p-2 shadow-[var(--shadow-md)]"
        style={{
          zIndex: PICKER_Z_PANEL,
          top: desktopPosition.top,
          left: desktopPosition.left,
          width: desktopPanelWidth,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {quickRow}
        {showFull && (
          <div className="mt-2 overflow-hidden rounded-xl border border-[var(--border)]">
            <FullEmojiPanel onSelect={handleSelect} onClose={onClose} width={320} height={300} />
          </div>
        )}
      </div>
    </>,
    document.body
  );
}
