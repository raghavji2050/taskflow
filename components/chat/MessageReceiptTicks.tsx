"use client";

import { Check, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessageReceiptStatus } from "@/lib/chat-receipts";

interface MessageReceiptTicksProps {
  status: MessageReceiptStatus;
  onAccent?: boolean;
  className?: string;
}

export function MessageReceiptTicks({ status, onAccent = false, className }: MessageReceiptTicksProps) {
  const isRead = status === "read";
  const isDelivered = status === "delivered" || isRead;

  if (isDelivered) {
    return (
      <CheckCheck
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          isRead
            ? "text-[var(--status-read)]"
            : onAccent
              ? "text-white/70"
              : "text-[var(--muted)]",
          className
        )}
        aria-label={isRead ? "Read" : "Delivered"}
      />
    );
  }

  return (
    <Check
      className={cn(
        "h-3.5 w-3.5 shrink-0",
        onAccent ? "text-white/70" : "text-[var(--muted)]",
        className
      )}
      aria-label="Sent"
    />
  );
}
