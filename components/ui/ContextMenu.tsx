"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/use-visual-viewport";

export type ContextMenuItem = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

interface ContextMenuProps {
  isOpen: boolean;
  onClose: () => void;
  items: ContextMenuItem[];
  anchorRef?: React.RefObject<HTMLElement | null>;
  /** Fallback position when no anchor */
  position?: { top: number; left: number };
  title?: string;
}

export function ContextMenu({
  isOpen,
  onClose,
  items,
  anchorRef,
  position,
  title,
}: ContextMenuProps) {
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery("(max-width: 767px)");

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || isMobile || !anchorRef?.current || !menuRef.current) return;
    const anchor = anchorRef.current.getBoundingClientRect();
    const menu = menuRef.current;
    const menuRect = menu.getBoundingClientRect();
    let top = anchor.bottom + 4;
    let left = anchor.right - menuRect.width;
    if (left < 8) left = 8;
    if (top + menuRect.height > window.innerHeight - 8) {
      top = anchor.top - menuRect.height - 4;
    }
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
  }, [isOpen, isMobile, anchorRef]);

  if (!isOpen || !mounted) return null;

  const menuContent = (
    <div className="py-1">
      {title && (
        <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          {title}
        </p>
      )}
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={item.disabled}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className={cn(
            "touch-target flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium transition-colors",
            item.destructive
              ? "text-red-400 hover:bg-red-500/10"
              : "text-[var(--foreground)] hover:bg-[var(--surface-hover)]",
            item.disabled && "pointer-events-none opacity-40"
          )}
        >
          {item.icon && (
            <span className="flex h-4 w-4 shrink-0 items-center [&_svg]:h-4 [&_svg]:w-4">
              {item.icon}
            </span>
          )}
          {item.label}
        </button>
      ))}
    </div>
  );

  if (isMobile) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex flex-col justify-end" role="presentation">
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />
        <div
          ref={menuRef}
          className="relative z-10 surface-panel safe-bottom rounded-b-none rounded-t-2xl border-b-0"
          role="menu"
        >
          <div className="mx-auto mb-2 mt-3 h-1 w-10 rounded-full bg-[var(--border)]" />
          {menuContent}
        </div>
      </div>,
      document.body
    );
  }

  const style: React.CSSProperties = position
    ? { top: position.top, left: position.left }
    : { top: 0, left: 0 };

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div
        ref={menuRef}
        style={style}
        className="surface-panel fixed z-50 min-w-[10rem] overflow-hidden rounded-lg border border-[var(--border)] shadow-lg"
        role="menu"
      >
        {menuContent}
      </div>
    </>,
    document.body
  );
}
