"use client";

import { Star } from "lucide-react";
import { getInitials } from "@/lib/utils";
import { cn } from "@/lib/utils";

export interface TaskAssigneeUser {
  userId?: string;
  isPrimary?: boolean;
  user: { id: string; name: string };
}

export function AssigneeChips({
  assignees,
  compact = false,
}: {
  assignees: TaskAssigneeUser[];
  compact?: boolean;
}) {
  if (!assignees.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {assignees.map((a) => (
        <span
          key={a.user.id}
          className={cn(
            "inline-flex items-center gap-1 rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted)]",
            compact && "px-1.5"
          )}
          title={a.isPrimary ? `${a.user.name} (Lead)` : a.user.name}
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[8px] font-bold text-[var(--accent)]">
            {getInitials(a.user.name)}
          </span>
          {!compact && <span>{a.user.name.split(" ")[0]}</span>}
          {a.isPrimary && <Star className="h-2.5 w-2.5 fill-[var(--warning)] text-[var(--warning)]" />}
        </span>
      ))}
    </div>
  );
}
