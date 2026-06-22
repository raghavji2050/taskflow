"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/components/motion";
import {
  mobileModalMaxHeight,
  mobileOverlayStyle,
  useMediaQuery,
  useVisualViewport,
} from "@/lib/use-visual-viewport";

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
  priority?: "normal" | "elevated";
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
  priority = "normal",
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const isMobile = useMediaQuery("(max-width: 639px)");
  const visualViewport = useVisualViewport();
  const reducedMotion = useReducedMotion();

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

  if (!mounted) return null;

  const dialogMotion = reducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 8, scale: 0.98 },
        transition: { type: "spring" as const, stiffness: 400, damping: 30 },
      };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          className={cn(
            "fixed flex items-end justify-center sm:inset-0 sm:items-center",
            !isMobile && "inset-0",
            priority === "elevated" ? "z-[60]" : "z-[60]"
          )}
          style={isMobile ? mobileOverlayStyle(visualViewport) : undefined}
          role="presentation"
        >
          <motion.div
            className="absolute inset-0 bg-black/50"
            onClick={onClose}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className={cn(
              "relative z-10 flex w-full flex-col",
              !isMobile && "max-h-[92dvh]",
              "sm:max-h-[min(90vh,860px)]",
              "surface-panel rounded-t-2xl border border-[var(--border)] shadow-lg",
              "sm:m-4 sm:rounded-xl",
              "safe-bottom",
              sizeClasses[size],
              className
            )}
            style={isMobile ? { maxHeight: mobileModalMaxHeight(visualViewport) } : undefined}
            {...dialogMotion}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <h2
                  id="modal-title"
                  className="text-lg font-semibold tracking-tight text-[var(--foreground)] sm:text-xl"
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
              <div className="shrink-0 border-t border-[var(--border)] px-5 py-4 safe-bottom sm:px-6">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
