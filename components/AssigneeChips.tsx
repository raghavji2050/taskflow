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
            "inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
            compact && "px-1.5"
          )}
          title={a.isPrimary ? `${a.user.name} (Lead)` : a.user.name}
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500/20 text-[8px] font-bold text-indigo-600 dark:text-indigo-400">
            {getInitials(a.user.name)}
          </span>
          {!compact && <span>{a.user.name.split(" ")[0]}</span>}
          {a.isPrimary && <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />}
        </span>
      ))}
    </div>
  );
}
