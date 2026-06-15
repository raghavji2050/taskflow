"use client";

import { useMemo } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
} from "date-fns";
import { cn, getPriorityColor, isSameCalendarDay } from "@/lib/utils";
import type { Task } from "@/components/TaskCard";
import { AssigneeChips } from "@/components/AssigneeChips";
import { Card } from "@/components/ui/Card";

interface CalendarViewProps {
  tasks: Task[];
  month: Date;
  onEdit: (task: Task) => void;
  onDayClick?: (day: Date) => void;
  showCreateHint?: boolean;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarView({ tasks, month, onEdit, onDayClick, showCreateHint = true }: CalendarViewProps) {
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    return eachDayOfInterval({
      start: startOfWeek(monthStart),
      end: endOfWeek(monthEnd),
    });
  }, [month]);

  const { scheduled, unscheduled } = useMemo(() => {
    const scheduledTasks = tasks.filter((t) => t.dueDate);
    const unscheduledTasks = tasks.filter((t) => !t.dueDate);
    return { scheduled: scheduledTasks, unscheduled: unscheduledTasks };
  }, [tasks]);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden p-4 sm:p-5">
        <h2 className="mb-4 text-center text-lg font-semibold text-zinc-800 dark:text-zinc-100">
          {format(month, "MMMM yyyy")}
        </h2>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-700">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="bg-zinc-50 px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:bg-zinc-900"
            >
              {d}
            </div>
          ))}

          {calendarDays.map((day) => {
            const dayTasks = scheduled.filter((t) =>
              isSameCalendarDay(t.dueDate, day)
            );
            const inMonth = isSameMonth(day, month);
            const today = isToday(day);

            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => onDayClick?.(day)}
                className={cn(
                  "min-h-[5.5rem] bg-white p-1.5 text-left transition-colors dark:bg-zinc-900",
                  "hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20",
                  !inMonth && "bg-zinc-50/80 dark:bg-zinc-950/50",
                  today && "ring-2 ring-inset ring-indigo-500/40"
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                    today && "bg-indigo-500 text-white",
                    !today && inMonth && "text-zinc-700 dark:text-zinc-300",
                    !inMonth && "text-zinc-400"
                  )}
                >
                  {format(day, "d")}
                </span>

                <div className="mt-1 space-y-0.5">
                  {dayTasks.slice(0, 3).map((task) => (
                    <span
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(task);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          onEdit(task);
                        }
                      }}
                      className={cn(
                        "block w-full rounded px-1 py-0.5 text-left text-[10px] font-medium",
                        getPriorityColor(task.priority)
                      )}
                    >
                      <span className="block truncate">{task.title}</span>
                      {task.assignees && task.assignees.length > 0 && (
                        <span className="mt-0.5 block" onClick={(e) => e.stopPropagation()}>
                          <AssigneeChips assignees={task.assignees} compact />
                        </span>
                      )}
                    </span>
                  ))}
                  {dayTasks.length > 3 && (
                    <span className="block px-1 text-[10px] text-zinc-400">
                      +{dayTasks.length - 3} more
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {showCreateHint && (
        <p className="mt-3 text-center text-xs text-zinc-400">
          Click a day to add a task with that due date
        </p>
        )}
      </Card>

      {unscheduled.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            No due date ({unscheduled.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {unscheduled.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onEdit(task)}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-opacity hover:opacity-80",
                  getPriorityColor(task.priority)
                )}
              >
                <span className="block truncate">{task.title}</span>
                {task.assignees && task.assignees.length > 0 && (
                  <span className="mt-1 block" onClick={(e) => e.stopPropagation()}>
                    <AssigneeChips assignees={task.assignees} compact />
                  </span>
                )}
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
