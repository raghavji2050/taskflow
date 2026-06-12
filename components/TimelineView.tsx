"use client";

import { format, addDays, startOfDay, differenceInDays } from "date-fns";
import type { Task } from "@/components/TaskCard";
import { AssigneeChips } from "@/components/AssigneeChips";
import { cn, getPriorityColor } from "@/lib/utils";

interface TimelineViewProps {
  tasks: Task[];
  onEdit: (task: Task) => void;
}

export function TimelineView({ tasks, onEdit }: TimelineViewProps) {
  const today = startOfDay(new Date());
  const rangeStart = addDays(today, -2);
  const rangeEnd = addDays(today, 14);
  const totalDays = differenceInDays(rangeEnd, rangeStart) + 1;

  const dated = tasks.filter((t) => t.dueDate);
  const undated = tasks.filter((t) => !t.dueDate);

  const dayPercent = (date: Date) => {
    const offset = differenceInDays(startOfDay(date), rangeStart);
    return Math.max(0, Math.min(100, (offset / totalDays) * 100));
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex min-w-[640px] justify-between text-[10px] text-zinc-400">
          <span>{format(rangeStart, "MMM d")}</span>
          <span>Today</span>
          <span>{format(rangeEnd, "MMM d")}</span>
        </div>
        <div className="relative min-w-[640px] space-y-2">
          <div className="absolute bottom-0 top-0 w-px bg-indigo-500/40" style={{ left: `${dayPercent(today)}%` }} />
          {dated.length === 0 ? (
            <p className="text-sm text-zinc-500">No tasks with due dates in this range.</p>
          ) : (
            dated.map((task) => {
              const due = new Date(task.dueDate!);
              const left = dayPercent(due);
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onEdit(task)}
                  className="relative flex w-full items-center gap-2 text-left"
                >
                  <div className="w-32 shrink-0 truncate text-xs font-medium">{task.title}</div>
                  <div className="relative h-7 flex-1 rounded bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className={cn("absolute top-1/2 h-5 -translate-y-1/2 rounded px-2 text-[10px] font-medium", getPriorityColor(task.priority))}
                      style={{ left: `${left}%`, transform: "translate(-50%, -50%)" }}
                    >
                      {format(due, "MMM d")}
                    </div>
                  </div>
                  {task.assignees && <AssigneeChips assignees={task.assignees} compact />}
                </button>
              );
            })
          )}
        </div>
      </div>

      {undated.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-600">No due date ({undated.length})</h3>
          <div className="flex flex-wrap gap-2">
            {undated.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onEdit(t)}
                className="rounded-lg border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700"
              >
                {t.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
