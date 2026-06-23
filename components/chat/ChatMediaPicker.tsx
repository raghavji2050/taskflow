"use client";

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { FullEmojiPanel } from "@/components/chat/EmojiPicker";
import { GifPicker, type SelectedGif } from "@/components/chat/GifPicker";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/use-visual-viewport";

const PICKER_Z_BACKDROP = 250;
const PICKER_Z_PANEL = 251;

type MediaTab = "emoji" | "gif";

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

function useDesktopPickerPosition(
  anchorRef: RefObject<HTMLElement | null> | undefined,
  panelWidth: number,
  panelHeight: number,
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
        setPosition(computePickerPosition(rect, panelWidth, panelHeight, "start", "top"));
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
  }, [anchorRef, panelWidth, panelHeight, enabled]);

  return position;
}

function TabBar({
  tab,
  onTabChange,
}: {
  tab: MediaTab;
  onTabChange: (tab: MediaTab) => void;
}) {
  return (
    <div className="flex border-b border-[var(--border)]">
      {(["emoji", "gif"] as const).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onTabChange(key)}
          className={cn(
            "flex-1 px-3 py-2 text-xs font-semibold capitalize transition-colors",
            tab === key
              ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
              : "text-[var(--muted)] hover:text-[var(--foreground)]"
          )}
        >
          {key === "emoji" ? "Emoji" : "GIF"}
        </button>
      ))}
    </div>
  );
}

interface ChatMediaPickerProps {
  onEmojiSelect: (emoji: string) => void;
  onGifSelect: (gif: SelectedGif) => void;
  onClose: () => void;
  anchorRef?: RefObject<HTMLElement | null>;
  initialTab?: MediaTab;
}

export function ChatMediaPicker({
  onEmojiSelect,
  onGifSelect,
  onClose,
  anchorRef,
  initialTab = "emoji",
}: ChatMediaPickerProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<MediaTab>(initialTab);
  const [panelWidth, setPanelWidth] = useState(320);
  const [panelHeight, setPanelHeight] = useState(400);

  useEffect(() => setMounted(true), []);
  useEffect(() => setTab(initialTab), [initialTab]);
  usePickerEscape(onClose);

  useEffect(() => {
    const update = () => {
      setPanelWidth(Math.min(352, Math.max(280, window.innerWidth - 24)));
      setPanelHeight(Math.min(420, Math.round(window.innerHeight * 0.5)));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const desktopPosition = useDesktopPickerPosition(
    anchorRef,
    320,
    panelHeight,
    !isMobile && mounted
  );

  const panelContent = (
    <>
      <TabBar tab={tab} onTabChange={setTab} />
      {tab === "emoji" ? (
        <FullEmojiPanel
          onSelect={(emoji) => {
            onEmojiSelect(emoji);
            onClose();
          }}
          onClose={onClose}
          width={isMobile ? panelWidth : 320}
          height={isMobile ? panelHeight - 88 : 340}
        />
      ) : (
        <GifPicker
          onSelect={(gif) => {
            onGifSelect(gif);
            onClose();
          }}
          height={isMobile ? panelHeight - 88 : 340}
        />
      )}
    </>
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
          {panelContent}
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
        style={{ zIndex: PICKER_Z_PANEL, top: desktopPosition.top, left: desktopPosition.left, width: 320 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {panelContent}
      </div>
    </>,
    document.body
  );
}
