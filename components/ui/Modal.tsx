"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const sizeClasses = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-4xl sm:max-w-5xl",
};

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  size?: keyof typeof sizeClasses;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  bodyClassName,
  size = "md",
}: ModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleEscape);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cn(
          "relative z-10 flex w-full flex-col",
          "max-h-[92dvh] sm:max-h-[min(90vh,860px)]",
          "rounded-t-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl",
          "sm:m-4 sm:rounded-2xl",
          "modal-enter",
          sizeClasses[size],
          className
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--card-border)] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2
              id="modal-title"
              className="text-lg font-semibold tracking-tight text-[var(--foreground)]"
            >
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 text-sm text-[var(--muted)]">{description}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 shrink-0 rounded-lg p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div
          className={cn(
            "flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6",
            bodyClassName
          )}
        >
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-[var(--card-border)] px-5 py-4 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
