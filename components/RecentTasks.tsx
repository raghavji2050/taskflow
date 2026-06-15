"use client";

import { Clock } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { AssigneeChips } from "@/components/AssigneeChips";
import { cn, formatRelativeDate, getPriorityColor } from "@/lib/utils";
import type { Task } from "@/components/TaskCard";

interface RecentTasksProps {
  tasks: Task[];
  onSelect?: (task: Task) => void;
  showMeta?: boolean;
}

export function RecentTasks({ tasks, onSelect, showMeta = false }: RecentTasksProps) {
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Recent</h2>
      {tasks.length === 0 ? (
        <p className="py-6 text-center text-xs text-zinc-400">No tasks yet</p>
      ) : (
        <div className="space-y-1">
          {tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => onSelect?.(task)}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
            >
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-sm font-medium text-zinc-800 dark:text-zinc-200", task.status === "COMPLETED" && "line-through opacity-60")}>{task.title}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-400">
                  <Clock className="h-3 w-3" />{formatRelativeDate(task.createdAt)}
                </p>
                {showMeta && task.assignees && task.assignees.length > 0 && (
                  <div className="mt-1">
                    <AssigneeChips assignees={task.assignees} compact />
                  </div>
                )}
              </div>
              <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase", getPriorityColor(task.priority))}>{task.priority}</span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
