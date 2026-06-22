"use client";

import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScheduleButtonProps {
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}

export function ScheduleButton({ disabled, onClick, className }: ScheduleButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50 md:h-10 md:w-10",
        className
      )}
      aria-label="Schedule message"
      title="Schedule message"
    >
      <Clock className="h-4 w-4 md:h-5 md:w-5" />
    </button>
  );
}
