import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Friendly empty state: icon, what this place is for, and the next step. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondary,
  compact,
  className,
  testId,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  secondary?: ReactNode;
  compact?: boolean;
  className?: string;
  testId?: string;
}) {
  return (
    <div data-testid={testId ?? "empty-state"} className={cn("flex flex-col items-center text-center", compact ? "py-6" : "py-14", className)}>
      <div className={cn("mb-3 flex items-center justify-center rounded-2xl bg-[var(--accent-soft)]", compact ? "h-10 w-10" : "h-14 w-14")}>
        <Icon className={cn("text-[var(--accent)]", compact ? "h-5 w-5" : "h-7 w-7")} aria-hidden="true" />
      </div>
      <p className={cn("font-semibold text-[var(--foreground)]", compact ? "text-sm" : "text-base")}>{title}</p>
      {description && <p className={cn("mt-1 max-w-sm text-[var(--muted)]", compact ? "text-xs" : "text-sm")}>{description}</p>}
      {(action || secondary) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondary}
        </div>
      )}
    </div>
  );
}
